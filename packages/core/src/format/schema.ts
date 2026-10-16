const base = {
  id: { type: 'string', minLength: 1 },
  source: { $ref: '#/$defs/source' },
  ext: { $ref: '#/$defs/ext' },
};
const num = { type: 'number' };
const pair = { type: 'array', items: num, minItems: 2, maxItems: 2 };

export const chalkBoardSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/FrankLaVigne/ChalkSmith/schema/board-v0.json',
  title: 'ChalkSmith board (format version 0)',
  type: 'object',
  required: ['id', 'background', 'objects'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    background: {
      type: 'object', required: ['color'], additionalProperties: false,
      properties: { color: { $ref: '#/$defs/rgba' } },
    },
    view: {
      type: 'object', required: ['x', 'y', 'zoom'], additionalProperties: false,
      properties: { x: num, y: num, zoom: { type: 'number', exclusiveMinimum: 0 } },
    },
    objects: { type: 'array', items: { $ref: '#/$defs/object' } },
    ext: { $ref: '#/$defs/ext' },
  },
  $defs: {
    ext: { type: 'object' },
    rgba: {
      type: 'object', required: ['r', 'g', 'b', 'a'], additionalProperties: false,
      properties: {
        r: { type: 'integer', minimum: 0, maximum: 255 },
        g: { type: 'integer', minimum: 0, maximum: 255 },
        b: { type: 'integer', minimum: 0, maximum: 255 },
        a: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    source: {
      type: 'object', required: ['system', 'id'], additionalProperties: false,
      properties: { system: { const: 'ms-whiteboard' }, id: { type: 'string' } },
    },
    bbox: {
      type: 'object', required: ['x', 'y', 'w', 'h'], additionalProperties: false,
      properties: { x: num, y: num, w: { type: 'number', minimum: 0 }, h: { type: 'number', minimum: 0 } },
    },
    brush: {
      oneOf: [
        { type: 'object', required: ['kind'], additionalProperties: false, properties: { kind: { const: 'solid' } } },
        {
          type: 'object', required: ['kind', 'name', 'origin', 'scale'], additionalProperties: false,
          properties: {
            kind: { const: 'texture' }, name: { enum: ['galaxy', 'rainbow'] },
            origin: pair, scale: { type: 'number', exclusiveMinimum: 0 },
          },
        },
      ],
    },
    stroke: {
      type: 'object', required: ['id', 'kind', 'tool', 'color', 'width', 'points', 'brush'], additionalProperties: false,
      properties: {
        ...base,
        kind: { const: 'stroke' },
        tool: { enum: ['pen', 'highlighter'] },
        color: { $ref: '#/$defs/rgba' },
        width: { type: 'number', exclusiveMinimum: 0 },
        points: { type: 'array', items: num },
        widths: { type: 'array', items: { type: 'number', minimum: 0 } },
        brush: { $ref: '#/$defs/brush' },
        sourceOutline: { type: 'string' },
        editedAt: { type: 'string' },
      },
    },
    group: {
      type: 'object', required: ['id', 'kind', 'transform', 'children'], additionalProperties: false,
      properties: {
        ...base,
        kind: { const: 'group' },
        transform: { type: 'array', items: num, minItems: 6, maxItems: 6 },
        children: { type: 'array', items: { $ref: '#/$defs/stroke' } },
      },
    },
    image: {
      type: 'object', required: ['id', 'kind', 'asset', 'x', 'y', 'w', 'h', 'intrinsic'], additionalProperties: false,
      properties: {
        ...base,
        kind: { const: 'image' },
        asset: { type: 'string', pattern: '^assets/[0-9a-f]{64}\\.(png|jpg|gif|webp)$' },
        x: num, y: num, w: { type: 'number', minimum: 0 }, h: { type: 'number', minimum: 0 },
        intrinsic: {
          type: 'object', required: ['w', 'h'], additionalProperties: false,
          properties: { w: { type: 'number', minimum: 0 }, h: { type: 'number', minimum: 0 } },
        },
      },
    },
    unsupported: {
      type: 'object', required: ['id', 'kind', 'sourceType', 'bbox'], additionalProperties: false,
      properties: {
        ...base,
        kind: { const: 'unsupported' },
        sourceType: { type: 'string' },
        bbox: { oneOf: [{ $ref: '#/$defs/bbox' }, { type: 'null' }] },
      },
    },
    object: {
      oneOf: [
        { $ref: '#/$defs/stroke' }, { $ref: '#/$defs/group' },
        { $ref: '#/$defs/image' }, { $ref: '#/$defs/unsupported' },
      ],
    },
  },
};
