/**
 * Configuration Parser
 * 
 * Parses configuration objects and extracts all fields with metadata
 */

import { ConfigField } from '../config-parser';
import { getFieldDefinition, FieldDefinition } from './field-definitions';

/**
 * Get JavaScript type of a value
 */
export function getValueType(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Recursively parse an object and extract all fields
 */
export function parseObject(
  obj: any,
  fieldDefinitions: Map<string, FieldDefinition>,
  parentPath: string = '',
  depth: number = 0,
  fields: ConfigField[] = []
): ConfigField[] {
  if (obj === null || obj === undefined) {
    return fields;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const arrayPath = parentPath ? `${parentPath}[${index}]` : `[${index}]`;
      if (typeof item === 'object' && item !== null) {
        parseObject(item, fieldDefinitions, arrayPath, depth + 1, fields);
      } else {
        const fieldDef = getFieldDefinition(parentPath.replace(/\[\d+\]/g, '[]'), fieldDefinitions);
        fields.push({
          path: arrayPath,
          name: `[${index}]`,
          value: item,
          type: getValueType(item),
          required: fieldDef?.required || false,
          description: fieldDef?.description,
          defaultValue: fieldDef?.defaultValue,
          enumValues: fieldDef?.enumValues,
          parentPath: parentPath,
          depth: depth,
          isLeaf: true,
          arrayIndex: index,
        });
      }
    });
    return fields;
  }

  if (typeof obj === 'object') {
    Object.keys(obj).forEach((key) => {
      // Skip comment fields
      if (key.startsWith('_')) {
        return;
      }

      const currentPath = parentPath ? `${parentPath}.${key}` : key;
      const value = obj[key];
      const valueType = getValueType(value);

      if (valueType === 'object' && !Array.isArray(value) && value !== null) {
        // Nested object - add parent field and recurse
        const fieldDef = getFieldDefinition(currentPath, fieldDefinitions);
        fields.push({
          path: currentPath,
          name: key,
          value: value,
          type: 'object',
          required: fieldDef?.required || false,
          description: fieldDef?.description,
          defaultValue: fieldDef?.defaultValue,
          parentPath: parentPath,
          depth: depth,
          isLeaf: false,
        });
        parseObject(value, fieldDefinitions, currentPath, depth + 1, fields);
      } else if (Array.isArray(value)) {
        // Array - add parent field and recurse
        const fieldDef = getFieldDefinition(currentPath, fieldDefinitions);
        fields.push({
          path: currentPath,
          name: key,
          value: value,
          type: 'array',
          required: fieldDef?.required || false,
          description: fieldDef?.description,
          defaultValue: fieldDef?.defaultValue,
          parentPath: parentPath,
          depth: depth,
          isLeaf: false,
        });
        parseObject(value, fieldDefinitions, currentPath, depth + 1, fields);
      } else {
        // Leaf node
        const fieldDef = getFieldDefinition(currentPath, fieldDefinitions);
        fields.push({
          path: currentPath,
          name: key,
          value: value,
          type: valueType,
          required: fieldDef?.required || false,
          description: fieldDef?.description,
          defaultValue: fieldDef?.defaultValue,
          enumValues: fieldDef?.enumValues,
          parentPath: parentPath,
          depth: depth,
          isLeaf: true,
        });
      }
    });
  }

  return fields;
}

/**
 * Extract comments from JSON (fields starting with _)
 */
export function extractComments(obj: any, path: string = ''): Map<string, string> {
  const comments = new Map<string, string>();
  
  if (typeof obj !== 'object' || obj === null) {
    return comments;
  }

  Object.keys(obj).forEach((key) => {
    const currentPath = path ? `${path}.${key}` : key;
    const value = obj[key];

    if (key.startsWith('_')) {
      // This is a comment field
      const targetPath = key.replace(/^_/, '').replace(/_comment$/, '').replace(/_note$/, '');
      const commentPath = path ? `${path}.${targetPath}` : targetPath;
      comments.set(commentPath, typeof value === 'string' ? value : JSON.stringify(value));
    } else if (typeof value === 'object' && value !== null) {
      // Recurse into nested objects
      const nestedComments = extractComments(value, currentPath);
      nestedComments.forEach((comment, commentPath) => {
        comments.set(commentPath, comment);
      });
    }
  });

  return comments;
}























