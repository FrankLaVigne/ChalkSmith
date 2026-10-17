# ChalkSmith `.chalk` format — version 0

A `.chalk` file is a ZIP archive:

| Entry | Content |
|---|---|
| `manifest.json` | `{ "format": "chalk", "version": 0, "createdBy", "createdAt", "modifiedAt" }` (ISO-8601 times) |
| `board.json` | The board, matching the schema below |
| `assets/<sha256>.<ext>` | Binary assets named by the SHA-256 of their bytes (`png`, `jpg`, `gif`, `webp`) |
| `extensions/…` | Optional pass-through data, e.g. `extensions/ms-whiteboard/comments.json` |

Readers must reject a `format` other than `"chalk"` and a `version` greater than they support.

ChalkSmith reads and writes files within these limits (uncompressed): at most 10,000 entries, 128 MB per entry and 1 GB in total. It refuses to save a board that exceeds them, so every file it writes can be reopened.

## Semantics

- Coordinates are CSS pixels; y points down. `view.x`/`view.y` are the world coordinates at the viewport's top-left corner.
- `objects` are in paint order (first = bottom). A group's `children` are in paint order too and live in group space; `transform` is `[a, b, c, d, e, f]` with `x' = a·x + c·y + e`, `y' = b·x + d·y + f`.
- A stroke's `points` is a flat `[x0, y0, x1, y1, …]` list; `widths`, when present, has one entry per point. `width` is the nominal width.
- `sourceOutline` is SVG path data (absolute `M`/`L`/`A`/`Z`) in the same space as `points`. Renderers draw it while `editedAt` is absent, and regenerate the outline from `points`/`widths` once `editedAt` is set.
- `brush.kind: "texture"` names a texture (`galaxy`, `rainbow`). Each application supplies its own artwork; `origin` and `scale` place it.
- Numbers are written with at most 4 decimal places.
- Extra checks beyond the schema: `points` has an even length; `widths` (if present) has `points.length / 2` entries.

## JSON Schema (draft 2020-12) for `board.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/FrankLaVigne/ChalkSmith/schema/board-v0.json",
  "title": "ChalkSmith board (format version 0)",
  "type": "object",
  "required": [
    "id",
    "background",
    "objects"
  ],
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "minLength": 1
    },
    "background": {
      "type": "object",
      "required": [
        "color"
      ],
      "additionalProperties": false,
      "properties": {
        "color": {
          "$ref": "#/$defs/rgba"
        }
      }
    },
    "view": {
      "type": "object",
      "required": [
        "x",
        "y",
        "zoom"
      ],
      "additionalProperties": false,
      "properties": {
        "x": {
          "type": "number"
        },
        "y": {
          "type": "number"
        },
        "zoom": {
          "type": "number",
          "exclusiveMinimum": 0
        }
      }
    },
    "objects": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/object"
      }
    },
    "ext": {
      "$ref": "#/$defs/ext"
    }
  },
  "$defs": {
    "ext": {
      "type": "object"
    },
    "rgba": {
      "type": "object",
      "required": [
        "r",
        "g",
        "b",
        "a"
      ],
      "additionalProperties": false,
      "properties": {
        "r": {
          "type": "integer",
          "minimum": 0,
          "maximum": 255
        },
        "g": {
          "type": "integer",
          "minimum": 0,
          "maximum": 255
        },
        "b": {
          "type": "integer",
          "minimum": 0,
          "maximum": 255
        },
        "a": {
          "type": "number",
          "minimum": 0,
          "maximum": 1
        }
      }
    },
    "source": {
      "type": "object",
      "required": [
        "system",
        "id"
      ],
      "additionalProperties": false,
      "properties": {
        "system": {
          "const": "ms-whiteboard"
        },
        "id": {
          "type": "string"
        }
      }
    },
    "bbox": {
      "type": "object",
      "required": [
        "x",
        "y",
        "w",
        "h"
      ],
      "additionalProperties": false,
      "properties": {
        "x": {
          "type": "number"
        },
        "y": {
          "type": "number"
        },
        "w": {
          "type": "number",
          "minimum": 0
        },
        "h": {
          "type": "number",
          "minimum": 0
        }
      }
    },
    "brush": {
      "oneOf": [
        {
          "type": "object",
          "required": [
            "kind"
          ],
          "additionalProperties": false,
          "properties": {
            "kind": {
              "const": "solid"
            }
          }
        },
        {
          "type": "object",
          "required": [
            "kind",
            "name",
            "origin",
            "scale"
          ],
          "additionalProperties": false,
          "properties": {
            "kind": {
              "const": "texture"
            },
            "name": {
              "enum": [
                "galaxy",
                "rainbow"
              ]
            },
            "origin": {
              "type": "array",
              "items": {
                "type": "number"
              },
              "minItems": 2,
              "maxItems": 2
            },
            "scale": {
              "type": "number",
              "exclusiveMinimum": 0
            }
          }
        }
      ]
    },
    "stroke": {
      "type": "object",
      "required": [
        "id",
        "kind",
        "tool",
        "color",
        "width",
        "points",
        "brush"
      ],
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        },
        "source": {
          "$ref": "#/$defs/source"
        },
        "ext": {
          "$ref": "#/$defs/ext"
        },
        "kind": {
          "const": "stroke"
        },
        "tool": {
          "enum": [
            "pen",
            "highlighter"
          ]
        },
        "color": {
          "$ref": "#/$defs/rgba"
        },
        "width": {
          "type": "number",
          "exclusiveMinimum": 0
        },
        "points": {
          "type": "array",
          "items": {
            "type": "number"
          }
        },
        "widths": {
          "type": "array",
          "items": {
            "type": "number",
            "minimum": 0
          }
        },
        "brush": {
          "$ref": "#/$defs/brush"
        },
        "sourceOutline": {
          "type": "string"
        },
        "editedAt": {
          "type": "string"
        }
      }
    },
    "group": {
      "type": "object",
      "required": [
        "id",
        "kind",
        "transform",
        "children"
      ],
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        },
        "source": {
          "$ref": "#/$defs/source"
        },
        "ext": {
          "$ref": "#/$defs/ext"
        },
        "kind": {
          "const": "group"
        },
        "transform": {
          "type": "array",
          "items": {
            "type": "number"
          },
          "minItems": 6,
          "maxItems": 6
        },
        "children": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/stroke"
          }
        }
      }
    },
    "image": {
      "type": "object",
      "required": [
        "id",
        "kind",
        "asset",
        "x",
        "y",
        "w",
        "h",
        "intrinsic"
      ],
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        },
        "source": {
          "$ref": "#/$defs/source"
        },
        "ext": {
          "$ref": "#/$defs/ext"
        },
        "kind": {
          "const": "image"
        },
        "asset": {
          "type": "string",
          "pattern": "^assets/[0-9a-f]{64}\\.(png|jpg|gif|webp)$"
        },
        "x": {
          "type": "number"
        },
        "y": {
          "type": "number"
        },
        "w": {
          "type": "number",
          "minimum": 0
        },
        "h": {
          "type": "number",
          "minimum": 0
        },
        "intrinsic": {
          "type": "object",
          "required": [
            "w",
            "h"
          ],
          "additionalProperties": false,
          "properties": {
            "w": {
              "type": "number",
              "minimum": 0
            },
            "h": {
              "type": "number",
              "minimum": 0
            }
          }
        }
      }
    },
    "unsupported": {
      "type": "object",
      "required": [
        "id",
        "kind",
        "sourceType",
        "bbox"
      ],
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1
        },
        "source": {
          "$ref": "#/$defs/source"
        },
        "ext": {
          "$ref": "#/$defs/ext"
        },
        "kind": {
          "const": "unsupported"
        },
        "sourceType": {
          "type": "string"
        },
        "bbox": {
          "oneOf": [
            {
              "$ref": "#/$defs/bbox"
            },
            {
              "type": "null"
            }
          ]
        }
      }
    },
    "object": {
      "oneOf": [
        {
          "$ref": "#/$defs/stroke"
        },
        {
          "$ref": "#/$defs/group"
        },
        {
          "$ref": "#/$defs/image"
        },
        {
          "$ref": "#/$defs/unsupported"
        }
      ]
    }
  }
}
```
