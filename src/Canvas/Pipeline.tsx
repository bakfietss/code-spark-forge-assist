import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
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
import { useLocation } from 'react-router-dom';

import { nodeTypes, useNodeFactories } from './NodeFactories';
import { useFieldStore } from '../store/fieldStore';
import DataSidebar from '../components/nodes/DataSidebar';
import MappingToolbar from '../components/nodes/MappingToolbar';
import MappingManager from '../components/nodes/MappingManager';
import { downloadBothMappingFiles } from './utils/FileDownloader';
import { importConfiguration } from './importers/ConfigImporter';
import { MappingConfiguration } from './types/MappingTypes';
import { exportMappingDocumentation } from './DocumentationExporter';
import { useNodeValueUpdates } from '../hooks/useNodeValueUpdates';
import { useManualUpdateTrigger } from '../hooks/useManualUpdateTrigger';
import { toast } from 'sonner';
import AiChatAssistant from '../components/AiChatAssistant';
import CanvasMiniMap from './components/CanvasMiniMap';
import { MappingSaveService } from '../services/MappingSaveService';
import { useAuth } from '../contexts/AuthContext';
import { useMappingLoaders } from './hooks/useMappingLoaders';
import { useCanvasEventHandlers } from './hooks/useCanvasEventHandlers';
import { useClickOutsideHandler } from './hooks/useClickOutsideHandler';

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
  const [currentMappingVersion, setCurrentMappingVersion] = useState<string>('');
  const [sampleData, setSampleData] = useState<any[]>([]);
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(false);
  const [isManagerExpanded, setIsManagerExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const fieldStore = useFieldStore();
  const { addSchemaNode, addTransformNode, addMappingNode } = useNodeFactories(nodes, setNodes);

  // Centralized update system - FIXED to pass edges
  const { updateTrigger, triggerUpdate } = useManualUpdateTrigger();
  const { enhancedNodes } = useNodeValueUpdates(updateTrigger, nodes, edges);

  // Use custom hooks for different loading scenarios
  useMappingLoaders({
    setNodes,
    setEdges,
    setSampleData,
    setCurrentMappingName,
    setCurrentMappingVersion,
    triggerUpdate
  });

  useCanvasEventHandlers({
    addTransformNode,
    addMappingNode,
    setNodes,
    setEdges,
    setSampleData
  });

  useClickOutsideHandler({
    reactFlowWrapper,
    setIsToolbarExpanded,
    setIsManagerExpanded
  });

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
        
        console.log('=== MAPPING IMPORT DEBUG ===');
        console.log('Imported nodes:', importedNodes.length);
        console.log('Imported edges:', importedEdges.length);
        
        // Log source nodes and their initial expanded fields
        importedNodes.forEach(node => {
          if (node.type === 'source') {
            console.log(`Source node ${node.id} initialExpandedFields:`, node.data?.initialExpandedFields);
          }
        });
        
        // AUDIT TRAIL: Analyze edges to determine which source fields need expansion
        console.log('=== IMPORT EXPANSION AUDIT TRAIL ===');
        console.log('Total imported edges:', importedEdges.length);
        
        const sourceFieldsToExpand = new Map<string, Set<string>>();
        importedEdges.forEach((edge, index) => {
          console.log(`Edge ${index + 1}:`, {
            id: edge.id,
            source: edge.source,
            target: edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle
          });
          
          if (edge.sourceHandle) {
            const sourceNodeId = edge.source;
            if (!sourceFieldsToExpand.has(sourceNodeId)) {
              sourceFieldsToExpand.set(sourceNodeId, new Set());
            }
            
            const fieldPath = edge.sourceHandle;
            console.log(`🔍 Analyzing path: ${fieldPath}`);
            
            // Split by dots and handle array indices - but don't expand indexed paths
            const pathParts = fieldPath.split('.');
            console.log('Path parts:', pathParts);
            
            // Build parent paths, but strip array indices to avoid duplicates
            for (let i = 0; i < pathParts.length - 1; i++) {
              let parentPath = pathParts.slice(0, i + 1).join('.');
              
              // Remove array indices like [0] to get just the base array name
              const cleanPath = parentPath.replace(/\[.*?\]/g, '');
              
              if (cleanPath) {
                sourceFieldsToExpand.get(sourceNodeId)!.add(cleanPath);
                console.log(`📂 Will expand (cleaned): ${cleanPath}`);
              }
            }
          } else {
            console.log('⚠️ Edge has no sourceHandle - skipping');
          }
        });
        
        // Summary of what will be expanded
        sourceFieldsToExpand.forEach((fieldsSet, nodeId) => {
          console.log(`📋 Node ${nodeId} will expand:`, Array.from(fieldsSet));
        });
        
        // Apply auto-expansion to source nodes based on their connections
        const enhancedNodes = importedNodes.map(node => {
          if (node.type === 'source' && sourceFieldsToExpand.has(node.id)) {
            const fieldsToExpand = sourceFieldsToExpand.get(node.id)!;
            console.log(`Auto-expanding fields for source ${node.id}:`, Array.from(fieldsToExpand));
            return {
              ...node,
              data: {
                ...node.data,
                initialExpandedFields: fieldsToExpand
              }
            };
          }
          return node;
        });
        
        // Import enhanced nodes first, then edges after a small delay to ensure handles are ready
        setNodes(enhancedNodes);
        setEdges([]);  // Clear edges first
        
        // Add edges after nodes are rendered and expanded
        setTimeout(() => {
          console.log('Setting imported edges...');
          setEdges(importedEdges);
          setTimeout(() => triggerUpdate('MAPPING_IMPORTED'), 100);
        }, 300); // Delay to ensure expansion happens first
        
        setCurrentMappingName(config.name || 'Untitled Mapping');
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

  const handleSaveMapping = async (name: string) => {
    const result = await MappingSaveService.saveMapping(name, nodes, edges, user?.id || '');
    
    if (result.success && result.version) {
      setCurrentMappingName(name.trim());
      setCurrentMappingVersion(result.version);
    }
  };

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
      <div className={`h-screen w-full ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'flex bg-background'}`}>
        {/* Hide sidebar in fullscreen mode */}
        {!isFullscreen && (
          <DataSidebar 
            side="left"
            title="Sample Data"
            data={sampleData}
            onDataChange={setSampleData}
          />
        )}
        <div className={`${isFullscreen ? 'w-full h-full' : 'flex-1'} relative overflow-hidden`} ref={reactFlowWrapper}>
          <ReactFlow
            nodes={enhancedNodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            className="bg-background w-full h-full"
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
            
            {/* Custom positioned controls and minimap at bottom left */}
            <div className="absolute bottom-4 left-4 z-50 flex flex-col gap-3 pointer-events-none">
              {/* Controls positioned horizontally above minimap */}
              <div className="flex justify-start pointer-events-auto">
                <Controls 
                  showZoom={true}
                  showFitView={true}
                  showInteractive={false}
                  position="bottom-left"
                  style={{ 
                    position: 'static',
                    transform: 'none',
                    background: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
                    display: 'flex',
                    flexDirection: 'row'
                  }}
                />
              </div>
              
              {/* Custom minimap component */}
              <CanvasMiniMap />
            </div>
          </ReactFlow>
          
          {/* Hide toolbars in fullscreen mode */}
          {!isFullscreen && (
            <>
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
                currentMappingVersion={currentMappingVersion}
                isExpanded={isManagerExpanded}
                onToggleExpanded={setIsManagerExpanded}
              />
              
              <AiChatAssistant />
            </>
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
};

export default Pipeline;
