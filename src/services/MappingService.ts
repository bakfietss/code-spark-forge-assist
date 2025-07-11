import { supabase } from "@/integrations/supabase/client";
import { Node, Edge } from '@xyflow/react';

export interface SavedMappingConfig {
  name: string;
  version: string;
  category: string;
  description?: string;
  tags?: string[];
  nodes: Node[];
  edges: Edge[];
  metadata?: {
    author?: string;
    created_at?: string;
    created_by?: string;
  };
}

export interface ExecutionMappingConfig {
  name: string;
  version: string;
  category: string;
  mappings: any[];
  arrays?: any[];
  metadata?: {
    description?: string;
    author?: string;
  };
}

export interface SavedMapping {
  id: string;
  name: string;
  version: string;
  category: string;
  description?: string;
  tags?: string[];
  transform_type?: string;
  ui_config: SavedMappingConfig;
  execution_config?: ExecutionMappingConfig;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export class MappingService {
  static async saveMapping(
    name: string,
    nodes: Node[],
    edges: Edge[],
    userId: string,
    category: string = 'General',
    description?: string,
    tags?: string[],
    executionConfig?: ExecutionMappingConfig,
    providedVersion?: string,
    transformType: string = 'JsonToJson'
  ): Promise<SavedMapping> {
    if (!userId) {
      throw new Error('User authentication is required to save mappings');
    }

    // First, check if there's an existing active mapping to inherit from
    const { data: existingMapping } = await supabase
      .from('mappings')
      .select('mapping_group_id, category, description, tags, transform_type')
      .eq('user_id', userId)
      .eq('name', name)
      .eq('is_active', true)
      .maybeSingle();

    // If this is a new mapping (no existing mapping group), check for name conflicts
    if (!existingMapping) {
      const { data: nameConflict } = await supabase
        .from('mappings')
        .select('id')
        .eq('user_id', userId)
        .eq('name', name.trim())
        .limit(1);

      if (nameConflict && nameConflict.length > 0) {
        throw new Error(`A mapping with the name "${name.trim()}" already exists. Please choose a different name.`);
      }
    }

    // Inherit metadata from existing mapping or use provided values
    const finalCategory = category !== 'General' ? category : (existingMapping?.category || 'General');
    const finalDescription = description || existingMapping?.description;
    const finalTags = tags || existingMapping?.tags || [];
    const finalTransformType = transformType !== 'JsonToJson' ? transformType : (existingMapping?.transform_type || 'JsonToJson');
    const mappingGroupId = existingMapping?.mapping_group_id || crypto.randomUUID();

    // Use provided version or get next version
    let version = providedVersion;
    if (!version) {
      const { data: nextVersion, error: versionError } = await supabase
        .rpc('get_next_version', {
          p_user_id: userId,
          p_name: name,
          p_category: finalCategory
        });

      if (versionError) {
        throw new Error(`Failed to get next version: ${versionError.message}`);
      }
      version = nextVersion;
    }

    // Create UI configuration that matches the SavedMappingConfig interface
    const uiConfig: SavedMappingConfig = {
      name,
      version,
      category: finalCategory,
      description: finalDescription,
      tags: finalTags,
      nodes,
      edges,
      metadata: {
        author: userId,
        created_at: new Date().toISOString(),
        created_by: userId
      }
    };

    // Deactivate all previous versions of this mapping group
    if (existingMapping) {
      const { error: deactivateError } = await supabase
        .from('mappings')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('mapping_group_id', mappingGroupId);
      
      if (deactivateError) {
        console.error('Failed to deactivate previous versions:', deactivateError);
        throw new Error(`Failed to deactivate previous versions: ${deactivateError.message}`);
      }
    }

    // Save new mapping with inherited metadata and group ID
    const { data, error } = await supabase
      .from('mappings')
      .insert({
        user_id: userId,
        name,
        version,
        category: finalCategory,
        description: finalDescription,
        tags: finalTags,
        transform_type: finalTransformType,
        mapping_group_id: mappingGroupId,
        ui_config: uiConfig as any,
        execution_config: executionConfig as any,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save mapping: ${error.message}`);
    }

    return {
      ...data,
      ui_config: data.ui_config as unknown as SavedMappingConfig,
      execution_config: data.execution_config as unknown as ExecutionMappingConfig
    };
  }

  static async getMappings(userId: string): Promise<SavedMapping[]> {
    if (!userId) {
      throw new Error('User authentication is required to fetch mappings');
    }

    const { data, error } = await supabase
      .from('mappings')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch mappings: ${error.message}`);
    }

    return (data || []).map(item => ({
      ...item,
      ui_config: item.ui_config as unknown as SavedMappingConfig,
      execution_config: item.execution_config as unknown as ExecutionMappingConfig
    }));
  }

  static async getActiveMapping(name: string, userId: string, category?: string): Promise<SavedMapping | null> {
    if (!userId) {
      throw new Error('User authentication is required to fetch mappings');
    }

    const { data, error } = await supabase
      .rpc('get_active_mapping', {
        p_user_id: userId,
        p_name: name,
        p_category: category
      });

    if (error) {
      throw new Error(`Failed to fetch active mapping: ${error.message}`);
    }

    return data ? {
      ...data,
      ui_config: data.ui_config as unknown as SavedMappingConfig,
      execution_config: data.execution_config as unknown as ExecutionMappingConfig
    } : null;
  }

  static async toggleMappingStatus(id: string, userId: string, isActive: boolean): Promise<void> {
    if (!userId) {
      throw new Error('User authentication is required to update mappings');
    }

    const { error } = await supabase
      .from('mappings')
      .update({ is_active: isActive })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to update mapping status: ${error.message}`);
    }
  }

  static async activateVersion(id: string, userId: string, name: string, category: string): Promise<void> {
    if (!userId) {
      throw new Error('User authentication is required to update mappings');
    }

    // First deactivate all versions of this mapping (handle null category properly)
    let deactivateQuery = supabase
      .from('mappings')
      .update({ is_active: false })
      .eq('user_id', userId)
      .eq('name', name);
    
    if (category) {
      deactivateQuery = deactivateQuery.eq('category', category);
    } else {
      deactivateQuery = deactivateQuery.is('category', null);
    }
    
    const { error: deactivateError } = await deactivateQuery;
    if (deactivateError) {
      throw new Error(`Failed to deactivate previous versions: ${deactivateError.message}`);
    }

    // Then activate the specific version
    const { error } = await supabase
      .from('mappings')
      .update({ is_active: true })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to activate mapping version: ${error.message}`);
    }
  }

  static async deleteMapping(id: string, userId: string): Promise<void> {
    if (!userId) {
      throw new Error('User authentication is required to delete mappings');
    }

    const { error } = await supabase
      .from('mappings')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete mapping: ${error.message}`);
    }
  }

  static async getMappingsByCategory(userId: string, category?: string): Promise<SavedMapping[]> {
    if (!userId) {
      throw new Error('User authentication is required to fetch mappings');
    }

    let query = supabase
      .from('mappings')
      .select('*')
      .eq('user_id', userId);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch mappings: ${error.message}`);
    }

    return (data || []).map(item => ({
      ...item,
      ui_config: item.ui_config as unknown as SavedMappingConfig,
      execution_config: item.execution_config as unknown as ExecutionMappingConfig
    }));
  }

  static async getLatestMappings(userId: string): Promise<SavedMapping[]> {
    if (!userId) {
      throw new Error('User authentication is required to fetch mappings');
    }

    const { data, error } = await supabase
      .from('mappings')
      .select('*')
      .eq('user_id', userId)
      .order('name', { ascending: true })
      .order('version', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch mappings: ${error.message}`);
    }

    // Group by mapping_group_id and get the active version or latest if no active
    const groupMap = new Map<string, any>();
    
    (data || []).forEach(item => {
      const groupId = item.mapping_group_id;
      const existing = groupMap.get(groupId);
      
      if (!existing) {
        groupMap.set(groupId, item);
      } else {
        // If current item is active, prioritize it
        if (item.is_active && !existing.is_active) {
          groupMap.set(groupId, item);
        }
        // If both have same active status, keep the latest version (already sorted)
      }
    });

    return Array.from(groupMap.values()).map(item => ({
      ...item,
      ui_config: item.ui_config as unknown as SavedMappingConfig,
      execution_config: item.execution_config as unknown as ExecutionMappingConfig
    }));
  }

  static async getMappingVersions(userId: string, name: string, category: string): Promise<SavedMapping[]> {
    if (!userId) {
      throw new Error('User authentication is required to fetch mappings');
    }

    const { data, error } = await supabase
      .from('mappings')
      .select('*')
      .eq('user_id', userId)
      .eq('name', name)
      .eq('category', category)
      .order('version', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch mapping versions: ${error.message}`);
    }

    return (data || []).map(item => ({
      ...item,
      ui_config: item.ui_config as unknown as SavedMappingConfig,
      execution_config: item.execution_config as unknown as ExecutionMappingConfig
    }));
  }

  static async updateMapping(id: string, userId: string, name: string, category: string, transformType?: string): Promise<void> {
    if (!userId) {
      throw new Error('User authentication is required to update mappings');
    }

    // Check if the new name already exists for this user (excluding current mapping group)
    const { data: existingMapping, error: existingError } = await supabase
      .from('mappings')
      .select('mapping_group_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (existingError || !existingMapping) {
      throw new Error(`Failed to find mapping: ${existingError?.message || 'Mapping not found'}`);
    }

    // Check for name conflicts with other mapping groups
    const { data: nameConflict } = await supabase
      .from('mappings')
      .select('id')
      .eq('user_id', userId)
      .eq('name', name.trim())
      .neq('mapping_group_id', existingMapping.mapping_group_id)
      .limit(1);

    if (nameConflict && nameConflict.length > 0) {
      throw new Error(`A mapping with the name "${name.trim()}" already exists. Please choose a different name.`);
    }

    // Get all mappings in the group to update their ui_config and execution_config
    const { data: allMappings, error: fetchError } = await supabase
      .from('mappings')
      .select('*')
      .eq('mapping_group_id', existingMapping.mapping_group_id)
      .eq('user_id', userId);

    if (fetchError) {
      throw new Error(`Failed to fetch mapping group: ${fetchError.message}`);
    }

    // Update each mapping in the group
    for (const mapping of allMappings || []) {
      const updateData: any = { 
        name: name.trim(),
        category: category.trim()
      };
      
      if (transformType) {
        updateData.transform_type = transformType.trim();
      }

      // Update ui_config with new name
      if (mapping.ui_config) {
        const uiConfig = mapping.ui_config as any;
        const updatedUiConfig = {
          ...uiConfig,
          name: name.trim()
        };
        updateData.ui_config = updatedUiConfig;
      }

      // Update execution_config with new name
      if (mapping.execution_config) {
        const executionConfig = mapping.execution_config as any;
        const updatedExecutionConfig = {
          ...executionConfig,
          name: name.trim()
        };
        updateData.execution_config = updatedExecutionConfig;
      }

      // Update this specific mapping
      const { error: updateError } = await supabase
        .from('mappings')
        .update(updateData)
        .eq('id', mapping.id)
        .eq('user_id', userId);

      if (updateError) {
        throw new Error(`Failed to update mapping: ${updateError.message}`);
      }
    }
  }

  static async copyMapping(mappingId: string, userId: string, newName: string, transformType?: string): Promise<SavedMapping> {
    if (!userId) {
      throw new Error('User authentication is required to copy mappings');
    }

    // Check if the new name already exists
    const { data: existingMapping } = await supabase
      .from('mappings')
      .select('id')
      .eq('user_id', userId)
      .eq('name', newName.trim())
      .limit(1);

    if (existingMapping && existingMapping.length > 0) {
      throw new Error(`A mapping with the name "${newName.trim()}" already exists. Please choose a different name.`);
    }

    // Get the original mapping
    const { data: originalMapping, error: fetchError } = await supabase
      .from('mappings')
      .select('*')
      .eq('id', mappingId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !originalMapping) {
      throw new Error(`Failed to find original mapping: ${fetchError?.message || 'Mapping not found'}`);
    }

    // Generate new mapping group ID and version
    const newMappingGroupId = crypto.randomUUID();
    const newVersion = 'v1.01';

    // Create the copy with new group ID and metadata
    const originalUiConfig = originalMapping.ui_config as any;
    const originalExecutionConfig = originalMapping.execution_config as any;
    
    const copyConfig = {
      ...originalUiConfig,
      name: newName.trim(),
      version: newVersion,
      metadata: {
        ...(originalUiConfig?.metadata || {}),
        created_at: new Date().toISOString(),
        created_by: userId
      }
    };

    const copyExecutionConfig = originalExecutionConfig ? {
      ...originalExecutionConfig,
      name: newName.trim(),
      version: newVersion
    } : undefined;

    // Insert the copy
    const { data: newMapping, error: insertError } = await supabase
      .from('mappings')
      .insert({
        user_id: userId,
        name: newName.trim(),
        version: newVersion,
        category: originalMapping.category,
        description: originalMapping.description,
        tags: originalMapping.tags,
        transform_type: transformType || originalMapping.transform_type || 'JsonToJson',
        mapping_group_id: newMappingGroupId,
        ui_config: copyConfig,
        execution_config: copyExecutionConfig,
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to copy mapping: ${insertError.message}`);
    }

    return {
      ...newMapping,
      ui_config: newMapping.ui_config as unknown as SavedMappingConfig,
      execution_config: newMapping.execution_config as unknown as ExecutionMappingConfig
    };
  }
}