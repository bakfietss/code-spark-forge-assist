
import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { nodeTypes, useNodeFactories } from './NodeFactories';
import { useFieldStore } from '../store/fieldStore';
import DataSidebar from '../compontents/DataSidebar';
import MappingToolbar from '../compontents/MappingToolbar';
import MappingManager from '../compontents/MappingManager';
import { downloadBothMappingFiles } from './utils/FileDownloader';
import { importConfiguration } from './importers/ConfigImporter';
import { MappingConfiguration } from './types/MappingTypes';
import { exportMappingDocumentation } from './DocumentationExporter';
import { useNodeValueUpdates } from '../hooks/useNodeValueUpdates';
import { useManualUpdateTrigger } from '../hooks/useManualUpdateTrigger';
import { toast } from 'sonner';

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'source',
    data: { label: 'Source 1' },
    position: { x: 50, y: 50 },
  },
];

const initialEdges: Edge[] = [];

const Pipeline = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [currentMappingName, setCurrentMappingName] = useState<string>('Untitled Mapping');
  const [sampleData, setSampleData] = useState<any[]>([]);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);
  const [isManagerExpanded, setIsManagerExpanded] = useState(false);

  const fieldStore = useFieldStore();
  const { addSchemaNode, addTransformNode, addMappingNode } = useNodeFactories(nodes, setNodes);

  // Centralized update system - FIXED to pass edges
  const { updateTrigger, triggerUpdate } = useManualUpdateTrigger();
  const { enhancedNodes } = useNodeValueUpdates(updateTrigger, nodes, edges);

  // Click outside to close functionality
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      const reactFlowElement = reactFlowWrapper.current?.querySelector('.react-flow');
      const isCanvasClick = reactFlowElement && reactFlowElement.contains(target);
      
      const toolbarElement = document.querySelector('[data-toolbar="mapping-toolbar"]');
      const isToolbarClick = toolbarElement && toolbarElement.contains(target);
      
      const managerElement = document.querySelector('[data-toolbar="mapping-manager"]');
      const isManagerClick = managerElement && managerElement.contains(target);
      
      if (isCanvasClick || (!isToolbarClick && !isManagerClick)) {
        setIsToolbarExpanded(false);
        setIsManagerExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const onConnect = useCallback((params: Connection) => {
    console.log('=== NEW CONNECTION CREATED ===');
    console.log('Connection params:', params);
    
    const newEdge = {
      ...params,
      type: 'smoothstep',
      animated: true,
      style: { 
        strokeWidth: 2,
        stroke: '#3b82f6',
        strokeDasharray: '5,5'
      }
    };
    setEdges((eds) => addEdge(newEdge, eds));
    
    // Trigger immediate update after connection
    setTimeout(() => triggerUpdate('CONNECTION_CREATED'), 50);
  }, [setEdges, triggerUpdate]);

  const handleEdgesChange = useCallback((changes: any[]) => {
    console.log('=== EDGE CHANGES ===');
    console.log('Edge changes:', changes);
    
    onEdgesChange(changes);
    
    const hasRemovals = changes.some(change => change.type === 'remove');
    const hasAdditions = changes.some(change => change.type === 'add');
    
    if (hasRemovals || hasAdditions) {
      setTimeout(() => triggerUpdate('EDGE_CHANGED'), 50);
    }
  }, [onEdgesChange, triggerUpdate]);

  const handleNodesChange = useCallback((changes: any[]) => {
    console.log('=== NODE CHANGES ===');
    console.log('Node changes:', changes);
    
    onNodesChange(changes);
    
    const hasDataUpdates = changes.some(change => 
      change.type === 'replace' || 
      (change.type === 'add') ||
      (change.type === 'remove')
    );
    
    if (hasDataUpdates) {
      setTimeout(() => triggerUpdate('NODE_DATA_CHANGED'), 50);
    }
  }, [onNodesChange, triggerUpdate]);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if(!reactFlowBounds) return;

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/label');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });
      
      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        position,
        data: { label: `${label} Node` },
        type,
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes, reactFlowInstance]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleReactFlowInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
  }, []);

  const handleExportMapping = useCallback(() => {
    try {
      downloadBothMappingFiles(nodes, edges, currentMappingName);
      toast.success('Mapping exported successfully!');
    } catch (error) {
      console.error('Failed to export mapping:', error);
      toast.error('Failed to export mapping');
    }
  }, [nodes, edges, currentMappingName]);

  const handleImportMapping = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const config: MappingConfiguration = JSON.parse(event.target?.result as string);
        const { nodes: importedNodes, edges: importedEdges } = importConfiguration(config);
        setNodes(importedNodes);
        setEdges(importedEdges);
        setCurrentMappingName(config.name || 'Untitled Mapping');
        setTimeout(() => triggerUpdate('MAPPING_IMPORTED'), 100);
        toast.success('Mapping imported successfully!');
      } catch (error) {
        console.error('Failed to import mapping:', error);
        toast.error('Failed to import mapping');
      }
    };
    reader.readAsText(file);
  }, [setNodes, setEdges, triggerUpdate]);

  const handleNewMapping = useCallback((name: string) => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setCurrentMappingName(name);
    fieldStore.resetAll();
    toast.success('New mapping created!');
  }, [setNodes, setEdges, fieldStore]);

  const handleSaveMapping = useCallback((name: string) => {
    setCurrentMappingName(name);
    toast.success('Mapping name updated!');
  }, []);

  const handleExportDocumentation = useCallback(() => {
    try {
      exportMappingDocumentation(nodes, edges, currentMappingName);
      toast.success('Documentation exported successfully!');
    } catch (error) {
      console.error('Failed to export documentation:', error);
      toast.error('Failed to export documentation');
    }
  }, [nodes, edges, currentMappingName]);

  return (
    <ReactFlowProvider>
      <div className="flex h-screen bg-gray-50">
        <DataSidebar 
          side="left"
          title="Sample Data"
          data={sampleData}
          onDataChange={setSampleData}
        />
        <div className="flex-1 relative" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={enhancedNodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            className="bg-gray-50"
            onInit={handleReactFlowInit}
            onDrop={onDrop}
            onDragOver={onDragOver}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: { 
                strokeWidth: 2,
                stroke: '#3b82f6',
                strokeDasharray: '5,5'
              }
            }}
          >
            <Background />
            <Controls />
          </ReactFlow>
          
          <MappingToolbar 
            onAddTransform={addTransformNode}
            onAddMappingNode={addMappingNode}
            onAddSchemaNode={addSchemaNode}
            isExpanded={isToolbarExpanded}
            onToggleExpanded={setIsToolbarExpanded}
          />
          
          <MappingManager 
            onExportMapping={handleExportMapping}
            onImportMapping={handleImportMapping}
            onNewMapping={handleNewMapping}
            onSaveMapping={handleSaveMapping}
            onExportDocumentation={handleExportDocumentation}
            currentMappingName={currentMappingName}
            isExpanded={isManagerExpanded}
            onToggleExpanded={setIsManagerExpanded}
          />
        </div>
      </div>
    </ReactFlowProvider>
  );
};

export default Pipeline;
