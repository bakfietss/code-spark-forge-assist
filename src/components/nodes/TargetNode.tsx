import React, { useState, useEffect } from 'react';
import { Handle, Position, NodeResizer } from '@xyflow/react';
import { FileText, Plus, Trash2, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { ScrollArea } from '../ui/scroll-area';
import { useNodeDataSync } from '../../hooks/useNodeDataSync';
import NodeEditSheet from './NodeEditSheet';
import JsonImportDialog from './JsonImportDialog';

interface SchemaField {
    id: string;
    name: string;
    type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
    children?: SchemaField[];
    parent?: string;
    groupBy?: string; // Add groupBy support
}

interface TargetNodeData {
    label: string;
    fields: SchemaField[];
    data?: any[];
    fieldValues?: Record<string, any>;
}

const getTypeColor = (type: string) => {
    switch (type) {
        case 'string': return 'text-green-600 bg-green-50';
        case 'number': return 'text-blue-600 bg-blue-50';
        case 'boolean': return 'text-purple-600 bg-purple-50';
        case 'date': return 'text-orange-600 bg-orange-50';
        case 'object': return 'text-gray-600 bg-gray-50';
        case 'array': return 'text-red-600 bg-red-50';
        default: return 'text-gray-600 bg-gray-50';
    }
};

const TargetField: React.FC<{
    field: SchemaField;
    fieldValues: Record<string, any>;
    allFields: SchemaField[];
    level?: number;
    expandedFields: Set<string>;
    onFieldExpansionToggle: (fieldId: string) => void;
    onFieldUpdate: (fieldId: string, updates: Partial<SchemaField>) => void;
}> = ({ field, fieldValues, allFields, level = 0, expandedFields, onFieldExpansionToggle, onFieldUpdate }) => {
    const fieldValue = fieldValues[field.id];
    const isExpanded = expandedFields.has(field.id);
    const hasChildren = field.children && field.children.length > 0;
    
    // Get available fields for groupBy dropdown (fields from the same level or source fields)
    const getGroupByOptions = (): string[] => {
        const options: string[] = [];
        
        // Add child field names if this is an array
        if (field.type === 'array' && field.children) {
            field.children.forEach(child => {
                options.push(child.name);
            });
        }
        
        return options;
    };

    if (field.type === 'array') {
        return (
            <div>
                <div 
                    className={`flex items-center gap-2 py-1 px-2 pr-8 hover:bg-gray-50 rounded text-sm group cursor-pointer relative`}
                    style={{ paddingLeft: `${8 + level * 12}px` }}
                    onClick={() => onFieldExpansionToggle(field.id)}
                >
                    <div className="cursor-pointer p-1 -m-1">
                        {isExpanded ? (
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                        ) : (
                            <ChevronRight className="w-3 h-3 text-gray-400" />
                        )}
                    </div>
                    <span className="font-medium text-gray-900 flex-1 min-w-0 truncate text-left">
                        {field.name}[]
                    </span>
                    {field.groupBy && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                            group by: {field.groupBy}
                        </span>
                    )}
                    {hasChildren && (
                        <span className="text-xs text-gray-500">({field.children!.length} items)</span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getTypeColor('array')}`}>
                        array
                    </span>
                    
                    <Handle
                        type="target"
                        position={Position.Left}
                        id={field.id}
                        className="w-3 h-3 bg-blue-500 border-2 border-white hover:bg-blue-600 !absolute !left-1"
                        style={{
                            top: '50%',
                            transform: 'translateY(-50%)',
                            zIndex: 10
                        }}
                    />
                </div>
                
                {isExpanded && hasChildren && (
                    <>
                        {/* GroupBy configuration row */}
                        <div 
                            className="flex items-center gap-2 py-1 px-2 pr-8 bg-blue-50 border-l-2 border-blue-200 text-xs"
                            style={{ paddingLeft: `${20 + level * 12}px` }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Settings className="w-3 h-3 text-blue-600" />
                            <span className="text-blue-700 font-medium">Group by:</span>
                            <select
                                value={field.groupBy || ''}
                                onChange={(e) => onFieldUpdate(field.id, { groupBy: e.target.value || undefined })}
                                className="text-xs border rounded px-2 py-1 bg-white"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <option value="">Select field...</option>
                                {getGroupByOptions().map(option => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                            <span className="text-blue-600 text-xs italic">
                                Choose which field to group records by
                            </span>
                        </div>
                        
                        {field.children!.map((childField) => (
                            <TargetField
                                key={childField.id}
                                field={childField}
                                fieldValues={fieldValues}
                                allFields={allFields}
                                level={level + 1}
                                expandedFields={expandedFields}
                                onFieldExpansionToggle={onFieldExpansionToggle}
                                onFieldUpdate={onFieldUpdate}
                            />
                        ))}
                    </>
                )}
            </div>
        );
    }
    
    if (field.type === 'object') {
        return (
            <div>
                <div 
                    className={`flex items-center gap-2 py-1 px-2 pr-8 hover:bg-gray-50 rounded text-sm group cursor-pointer relative`}
                    style={{ paddingLeft: `${8 + level * 12}px` }}
                    onClick={() => onFieldExpansionToggle(field.id)}
                >
                    <div className="cursor-pointer p-1 -m-1">
                        {isExpanded ? (
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                        ) : (
                            <ChevronRight className="w-3 h-3 text-gray-400" />
                        )}
                    </div>
                    <span className="font-medium text-gray-900 flex-1 min-w-0 truncate text-left">
                        {field.name}
                    </span>
                    {hasChildren && (
                        <span className="text-xs text-gray-500">
                            ({field.children!.length} fields)
                        </span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getTypeColor('object')}`}>
                        object
                    </span>
                    
                    <Handle
                        type="target"
                        position={Position.Left}
                        id={field.id}
                        className="w-3 h-3 bg-blue-500 border-2 border-white hover:bg-blue-600 !absolute !left-1"
                        style={{
                            top: '50%',
                            transform: 'translateY(-50%)',
                            zIndex: 10
                        }}
                    />
                </div>
                
                {isExpanded && hasChildren && field.children!.map((childField) => (
                    <TargetField
                        key={childField.id}
                        field={childField}
                        fieldValues={fieldValues}
                        allFields={allFields}
                        level={level + 1}
                        expandedFields={expandedFields}
                        onFieldExpansionToggle={onFieldExpansionToggle}
                        onFieldUpdate={onFieldUpdate}
                    />
                ))}
            </div>
        );
    }
    
    // Primitive field
    return (
        <div 
            className={`flex items-center gap-2 py-1 px-2 pr-8 hover:bg-gray-50 rounded text-sm group cursor-pointer relative`}
            style={{ paddingLeft: `${8 + level * 12}px` }}
        >
            <div className="w-3 h-3" />
            <span className="font-medium text-gray-900 flex-1 min-w-0 truncate text-left">{field.name}</span>
            <div className="text-xs min-w-[80px] text-center">
                {fieldValue !== undefined && fieldValue !== null && fieldValue !== '' ? (
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-medium">
                        {String(fieldValue)}
                    </span>
                ) : (
                    <span className="text-gray-400 italic">no value</span>
                )}
            </div>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(field.type)}`}>
                {field.type}
            </span>
            
            <Handle
                type="target"
                position={Position.Left}
                id={field.id}
                className="w-3 h-3 bg-blue-500 border-2 border-white group-hover:bg-blue-600 !absolute !left-1"
                style={{
                    top: '50%',
                    transform: 'translateY(-50%)',
                }}
            />
        </div>
    );
};

const TargetNode: React.FC<{ data: TargetNodeData; id: string }> = ({ data, id }) => {
    const [fields, setFields] = useState<SchemaField[]>(data.fields || []);
    const [nodeData, setNodeData] = useState<any[]>(data.data || []);
    const [jsonInput, setJsonInput] = useState('');
    const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
    
    // Use ONLY the centralized field values from data.fieldValues (set by the centralized system)
    const fieldValues = data.fieldValues || {};
    
    // Sync local state changes back to React Flow
    useNodeDataSync(id, { fields, data: nodeData }, [fields, nodeData]);
    
    console.log('=== TARGET NODE RENDER ===');
    console.log('Node ID:', id);
    console.log('Field values from centralized system:', fieldValues);
    console.log('All fields:', fields?.map(f => ({ id: f.id, name: f.name, groupBy: f.groupBy })));

    const addField = (parentId?: string) => {
        const newField: SchemaField = {
            id: `field-${Date.now()}`,
            name: 'New Field',
            type: 'string',
            parent: parentId
        };
        
        if (parentId) {
            // Add as child field
            const updatedFields = fields.map(field => {
                if (field.id === parentId) {
                    return {
                        ...field,
                        children: [...(field.children || []), newField]
                    };
                }
                return field;
            });
            setFields(updatedFields);
        } else {
            // Add as root field
            setFields([...fields, newField]);
        }
    };

    const updateField = (fieldId: string, updates: Partial<SchemaField>) => {
        const updateFieldRecursive = (fieldsArray: SchemaField[]): SchemaField[] => {
            return fieldsArray.map(field => {
                if (field.id === fieldId) {
                    const updatedField = { ...field, ...updates };
                    // If changing to object/array, ensure children array exists
                    if ((updates.type === 'object' || updates.type === 'array') && !updatedField.children) {
                        updatedField.children = [];
                    }
                    // If changing away from object/array, remove children and groupBy
                    if (updates.type && updates.type !== 'object' && updates.type !== 'array') {
                        delete updatedField.children;
                        delete updatedField.groupBy;
                    }
                    return updatedField;
                }
                if (field.children) {
                    return {
                        ...field,
                        children: updateFieldRecursive(field.children)
                    };
                }
                return field;
            });
        };
        
        setFields(updateFieldRecursive(fields));
    };

    const deleteField = (fieldId: string) => {
        const deleteFieldRecursive = (fieldsArray: SchemaField[]): SchemaField[] => {
            return fieldsArray.filter(field => {
                if (field.id === fieldId) {
                    return false;
                }
                if (field.children) {
                    field.children = deleteFieldRecursive(field.children);
                }
                return true;
            });
        };
        
        setFields(deleteFieldRecursive(fields));
    };

    const handleFieldExpansionToggle = (fieldId: string) => {
        const newExpanded = new Set(expandedFields);
        if (expandedFields.has(fieldId)) {
            newExpanded.delete(fieldId);
        } else {
            newExpanded.add(fieldId);
        }
        setExpandedFields(newExpanded);
    };

    const handleJsonImport = () => {
        try {
            const parsed = JSON.parse(jsonInput);
            const dataArray = Array.isArray(parsed) ? parsed : [parsed];
            setNodeData(dataArray);
            setJsonInput('');
            
            // Auto-generate fields from first object
            if (dataArray.length > 0 && typeof dataArray[0] === 'object') {
                const generateFieldsFromObject = (obj: any, parentPath = ''): SchemaField[] => {
                    return Object.keys(obj).map((key, index) => {
                        const value = obj[key];
                        const fieldId = `field-${Date.now()}-${parentPath}-${index}`;
                        
                        if (Array.isArray(value)) {
                            return {
                                id: fieldId,
                                name: key,
                                type: 'array',
                                children: value.length > 0 && typeof value[0] === 'object' 
                                    ? generateFieldsFromObject(value[0], `${fieldId}-item`)
                                    : []
                            };
                        } else if (value && typeof value === 'object') {
                            return {
                                id: fieldId,
                                name: key,
                                type: 'object',
                                children: generateFieldsFromObject(value, fieldId)
                            };
                        } else {
                            return {
                                id: fieldId,
                                name: key,
                                type: typeof value === 'number' ? 'number' : 
                                      typeof value === 'boolean' ? 'boolean' : 'string'
                            };
                        }
                    });
                };
                
                setFields(generateFieldsFromObject(dataArray[0]));
            }
        } catch (error) {
            console.error('Invalid JSON:', error);
            alert('Invalid JSON format');
        }
    };

    const renderFieldEditor = (field: SchemaField, level = 0) => (
        <div key={field.id} className="border rounded p-3 space-y-2" style={{ marginLeft: `${level * 16}px` }}>
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={field.name}
                    onChange={(e) => updateField(field.id, { name: e.target.value })}
                    className="flex-1 border rounded px-2 py-1 text-sm"
                    placeholder="Field name"
                />
                <select
                    value={field.type}
                    onChange={(e) => updateField(field.id, { type: e.target.value as any })}
                    className="border rounded px-2 py-1 text-sm"
                >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="date">Date</option>
                    <option value="object">Object</option>
                    <option value="array">Array</option>
                </select>
                {field.type === 'array' && (
                    <select
                        value={field.groupBy || ''}
                        onChange={(e) => updateField(field.id, { groupBy: e.target.value || undefined })}
                        className="border rounded px-2 py-1 text-sm bg-blue-50"
                    >
                        <option value="">No grouping</option>
                        {field.children?.map(child => (
                            <option key={child.id} value={child.name}>{child.name}</option>
                        ))}
                    </select>
                )}
                {(field.type === 'object' || field.type === 'array') && (
                    <button
                        onClick={() => addField(field.id)}
                        className="flex items-center gap-1 px-2 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                    >
                        <Plus className="w-3 h-3" />
                        Add Child
                    </button>
                )}
                <button
                    onClick={() => deleteField(field.id)}
                    className="p-1 text-red-500 hover:text-red-700"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            </div>
            
            {field.children && field.children.map(childField => 
                renderFieldEditor(childField, level + 1)
            )}
        </div>
    );

    return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm min-w-[500px] max-w-[600px] relative">
            <NodeResizer minWidth={400} minHeight={200} />
            
            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 bg-green-50">
                <FileText className="w-4 h-4 text-green-600" />
                <span className="font-semibold text-gray-900 flex-1">{data.label}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                    target
                </span>
                
                <NodeEditSheet title={`Edit ${data.label} - Target Schema`}>
                    <div className="flex-1 flex flex-col space-y-6 mt-6 min-h-0">
                        {/* Current Data Preview */}
                        <div className="flex-shrink-0">
                            <h4 className="font-medium mb-2">Current Data ({nodeData.length} records):</h4>
                            <div className="h-64 border rounded p-2 bg-gray-50">
                                <ScrollArea className="h-full">
                                    {nodeData.length > 0 ? (
                                        <pre className="text-xs">
                                            {JSON.stringify(nodeData.slice(0, 3), null, 2)}
                                            {nodeData.length > 3 && '\n... and more'}
                                        </pre>
                                    ) : (
                                        <p className="text-gray-500 text-sm">No data available</p>
                                    )}
                                </ScrollArea>
                            </div>
                        </div>

                        {/* Schema Fields */}
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-medium">Schema Fields:</h4>
                                <div className="flex gap-2">
                                    <JsonImportDialog
                                        jsonInput={jsonInput}
                                        setJsonInput={setJsonInput}
                                        onImport={handleJsonImport}
                                        triggerText="Import JSON"
                                        title="Import Data & Generate Schema"
                                    />
                                    <button
                                        onClick={() => addField()}
                                        className="flex items-center gap-1 px-3 py-2 bg-green-500 text-white rounded text-sm hover:bg-green-600"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add Field
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex-1 border rounded min-h-0 bg-gray-50">
                                <ScrollArea className="h-full">
                                    <div className="space-y-4 p-4">
                                        {fields.length > 0 ? (
                                            fields.map((field) => renderFieldEditor(field))
                                        ) : (
                                            <div className="text-center py-8 text-gray-500">
                                                No fields defined. Click "Add Field" to create your first field.
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                        </div>
                    </div>
                </NodeEditSheet>
            </div>

            <div className="p-1">
                {fields.map((field) => (
                    <TargetField
                        key={field.id}
                        field={field}
                        fieldValues={fieldValues}
                        allFields={fields}
                        expandedFields={expandedFields}
                        onFieldExpansionToggle={handleFieldExpansionToggle}
                        onFieldUpdate={updateField}
                    />
                ))}
                
                {fields.length === 0 && (
                    <div className="text-center py-3 text-gray-500 text-xs">
                        No fields defined. Click edit to add schema fields.
                    </div>
                )}
            </div>
        </div>
    );
};

export default TargetNode;
