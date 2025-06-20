import { Node, Edge } from '@xyflow/react';
import { MappingConfiguration, SourceNodeConfig, TargetNodeConfig } from '../types/MappingTypes';
import { buildExecutionSteps } from '../utils/ExecutionStepBuilder';

export const exportUIMappingConfiguration = (
  nodes: Node[],
  edges: Edge[],
  name: string = 'Untitled Mapping'
): MappingConfiguration => {
  console.log('=== EXPORT DEBUG START ===');
  console.log('Exporting nodes:', nodes.length);
  console.log('All nodes and their types:', nodes.map(n => ({ id: n.id, type: n.type, transformType: n.data?.transformType })));
  
  // Add comprehensive debug for ALL nodes that contain "coalesce" anywhere
  nodes.forEach(node => {
    const nodeId = typeof node.id === 'string' ? node.id.toLowerCase() : '';
    const nodeType = typeof node.type === 'string' ? node.type.toLowerCase() : '';
    const transformType = typeof node.data?.transformType === 'string' ? node.data.transformType.toLowerCase() : '';
    
    if (nodeId.includes('coalesce') || nodeType.includes('coalesce') || transformType.includes('coalesce')) {
      console.log('FOUND COALESCE-LIKE NODE:', {
        id: node.id,
        type: node.type,
        transformType: node.data?.transformType,
        fullData: node.data
      });
    }
  });

  const config: MappingConfiguration = {
    id: `mapping_${Date.now()}`,
    name,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    nodes: {
      sources: [],
      targets: [],
      transforms: [],
      mappings: []
    },
    connections: [],
    execution: {
      steps: buildExecutionSteps(nodes, edges)
    },
    metadata: {
      description: 'UI mapping configuration for canvas restoration',
      tags: ['ui-state', 'canvas-layout', 'visual-mapping'],
      author: 'Lovable Mapping Tool'
    }
  };

  // Extract source nodes
  nodes.filter(node => node.type === 'source')
    .forEach(node => {
      config.nodes.sources.push({
        id: node.id,
        type: 'source',
        label: String(node.data?.label || 'Source Node'),
        position: node.position,
        schema: {
          fields: Array.isArray(node.data?.fields) ? node.data.fields : []
        },
        sampleData: Array.isArray(node.data?.data) ? node.data.data : []
      });
    });

  // Extract target nodes - preserve fieldValues
  nodes.filter(node => node.type === 'target')
    .forEach(node => {
      const targetConfig: TargetNodeConfig = {
        id: node.id,
        type: 'target',
        label: String(node.data?.label || 'Target Node'),
        position: node.position,
        schema: {
          fields: Array.isArray(node.data?.fields) ? node.data.fields : []
        },
        outputData: Array.isArray(node.data?.data) ? node.data.data : []
      };
      
      // Preserve fieldValues if they exist
      if (node.data?.fieldValues && typeof node.data.fieldValues === 'object') {
        (targetConfig as any).fieldValues = node.data.fieldValues;
      }
      
      config.nodes.targets.push(targetConfig);
    });

  // Extract ALL transform-like nodes - FIXED LOGIC
  const allTransformNodes = nodes.filter(node => {
    // Include any node that is NOT a basic node type (source, target, conversionMapping)
    const isBasicNode = ['source', 'target', 'conversionMapping'].includes(node.type);
    return !isBasicNode;
  });

  console.log('Transform nodes found:', allTransformNodes.length);
  console.log('Transform nodes details:', allTransformNodes.map(n => ({ 
    id: n.id, 
    type: n.type, 
    transformType: n.data?.transformType,
    hasData: !!n.data 
  })));

  allTransformNodes.forEach(node => {
    console.log('Processing transform node:', node.id, 'type:', node.type);
    
    let transformConfig: any = {
      id: node.id,
      type: node.type, // Use the actual node type directly
      label: String(node.data?.label || 'Transform Node'),
      position: node.position,
      transformType: String(node.data?.transformType || node.type || 'unknown'),
      config: {}
    };

    // Handle different node types based on their actual type
    if (node.type === 'ifThen') {
      transformConfig.config = {
        operation: 'conditional',
        parameters: {
          operator: node.data?.operator || '=',
          compareValue: node.data?.compareValue || '',
          thenValue: node.data?.thenValue || '',
          elseValue: node.data?.elseValue || ''
        }
      };
      transformConfig.nodeData = {
        operator: node.data?.operator || '=',
        compareValue: node.data?.compareValue || '',
        thenValue: node.data?.thenValue || '',
        elseValue: node.data?.elseValue || ''
      };
    } else if (node.type === 'staticValue') {
      transformConfig.config = {
        operation: 'static',
        parameters: {
          values: node.data?.values || []
        }
      };
      transformConfig.nodeData = {
        values: node.data?.values || []
      };
    } else if (node.type === 'splitterTransform') {
      const additionalConfig = node.data?.config && typeof node.data.config === 'object' ? node.data.config : {};
      transformConfig.config = {
        operation: 'split',
        parameters: {
          delimiter: node.data?.delimiter || ',',
          splitIndex: node.data?.splitIndex || 0,
          ...additionalConfig
        }
      };
      transformConfig.nodeData = {
        delimiter: node.data?.delimiter || ',',
        splitIndex: node.data?.splitIndex || 0,
        config: additionalConfig
      };
    } else if (node.type === 'coalesceTransform' || (node.type === 'transform' && node.data?.transformType === 'coalesce')) {
      console.log('COALESCE EXPORT:', node);
      console.log('PROCESSING COALESCE TRANSFORM NODE:', node.id);
      console.log('Coalesce node data:', node.data);
      
      transformConfig.config = {
        operation: 'coalesce',
        parameters: {
          rules: node.data?.rules || [],
          defaultValue: node.data?.defaultValue || '',
          outputType: node.data?.outputType || 'value'
        }
      };
      transformConfig.nodeData = {
        rules: node.data?.rules || [],
        defaultValue: node.data?.defaultValue || '',
        outputType: node.data?.outputType || 'value',
        inputValues: node.data?.inputValues || {}
      };
      
      console.log('Coalesce transform config created:', transformConfig);
    } else {
      // Handle generic transform nodes and any other types
      console.log('Processing generic transform node:', node.id, 'with type:', node.type);
      transformConfig.config = node.data?.config || node.data || {};
      if (node.data) {
        transformConfig.nodeData = node.data;
      }
    }

    console.log('Adding transform config:', transformConfig.id, 'with type:', transformConfig.type);
    config.nodes.transforms.push(transformConfig);
  });

  console.log('Final transforms in config:', config.nodes.transforms.length);
  console.log('Transform IDs and types:', config.nodes.transforms.map(t => ({ id: t.id, type: t.type, transformType: t.transformType })));

  // Extract mapping nodes
  nodes.filter(node => node.type === 'conversionMapping')
    .forEach(node => {
      config.nodes.mappings.push({
        id: node.id,
        type: 'mapping',
        label: String(node.data?.label || 'Mapping Node'),
        position: node.position,
        mappings: Array.isArray(node.data?.mappings) ? node.data.mappings : []
      });
    });

  // Extract connections
  edges.forEach(edge => {
    const sourceNode = nodes.find(n => n.id === edge.source);
    
    let connectionType: 'direct' | 'transform' | 'mapping' = 'direct';
    
    if (sourceNode && !['source', 'target', 'conversionMapping'].includes(sourceNode.type)) {
      connectionType = 'transform';
    } else if (sourceNode?.type === 'conversionMapping') {
      connectionType = 'mapping';
    }

    config.connections.push({
      id: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      sourceHandle: edge.sourceHandle || '',
      targetHandle: edge.targetHandle || '',
      type: connectionType
    });
  });

  console.log('=== EXPORT DEBUG END ===');
  console.log('Final config transforms:', config.nodes.transforms);
  
  return config;
};
