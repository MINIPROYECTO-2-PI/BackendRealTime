import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import type { Express } from 'express'

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'MP2 Backend Real-Time — API & WebSocket Docs',
    version: '1.0.0',
    description:
      'Documentación del Backend Real-Time de MiniProyecto 2.\n\n' +
      'Este servidor maneja la comunicación en tiempo real usando **Socket.IO** para salas de chat, ' +
      'presencia de usuarios y mensajería instantánea.\n\n' +
      '## Endpoints HTTP\n' +
      'Endpoints REST convencionales documentados abajo.\n\n' +
      '## Eventos WebSocket (Socket.IO)\n' +
      'Los eventos de WebSocket se documentan como schemas de referencia en la sección **WebSocket Events** ' +
      'ya que Swagger/OpenAPI no soporta nativamente WebSockets.',
    contact: {
      name: 'Equipo MP2'
    }
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Servidor local de desarrollo (Real-Time)'
    }
  ],
  tags: [
    {
      name: 'Health',
      description: 'Endpoints de estado del servidor'
    },
    {
      name: 'WebSocket — Conexión',
      description: 'Eventos de conexión y desconexión del cliente'
    },
    {
      name: 'WebSocket — Salas',
      description:
        'Eventos para unirse, validar y eliminar salas en tiempo real'
    },
    {
      name: 'WebSocket — Mensajes',
      description: 'Envío y recepción de mensajes en tiempo real'
    },
    {
      name: 'WebSocket — Presencia',
      description: 'Eventos de presencia de usuarios (join/leave)'
    }
  ],
  components: {
    schemas: {
      // ─── Message Schema ───────────────────────────
      Message: {
        type: 'object',
        description: 'Estructura de un mensaje de chat',
        properties: {
          id: {
            type: 'string',
            description: 'ID del documento en Firestore',
            example: 'msg_abc123'
          },
          roomId: {
            type: 'string',
            description: 'Código de la sala',
            example: 'a3b-c4d5-e6f'
          },
          senderUid: {
            type: 'string',
            description: 'UID del remitente',
            example: 'user_uid_123'
          },
          senderUsername: {
            type: 'string',
            description: 'Username del remitente',
            example: 'jhoan_dev'
          },
          text: {
            type: 'string',
            description: 'Contenido del mensaje',
            example: '¡Hola a todos!'
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Fecha de creación'
          }
        }
      },

      // ─── Active User Schema ───────────────────────
      ActiveUser: {
        type: 'object',
        description: 'Usuario activo en una sala',
        properties: {
          username: { type: 'string', example: 'jhoan_dev' },
          uid: { type: 'string', example: 'user_uid_123' }
        }
      },

      // ─── WebSocket Event Schemas ──────────────────
      WS_JoinRoom_Emit: {
        type: 'object',
        description:
          '**Evento:** `join-room` → Cliente envía para unirse a una sala',
        properties: {
          roomId: {
            type: 'string',
            description: 'Código único de la sala',
            example: 'a3b-c4d5-e6f'
          },
          username: {
            type: 'string',
            description: 'Username del usuario',
            example: 'jhoan_dev'
          },
          uid: {
            type: 'string',
            description: 'UID de Firebase',
            example: 'user_uid_123'
          }
        },
        required: ['roomId', 'username', 'uid']
      },

      WS_RoomJoinedSuccess: {
        type: 'object',
        description:
          '**Evento:** `room-joined-success` → Servidor confirma entrada exitosa a la sala',
        properties: {
          roomId: { type: 'string', example: 'a3b-c4d5-e6f' },
          roomName: { type: 'string', example: 'Sala de Estudio' },
          hostUid: { type: 'string', example: 'host_uid_456' },
          activeUsers: {
            type: 'array',
            items: { $ref: '#/components/schemas/ActiveUser' }
          }
        }
      },

      WS_RoomInvalid: {
        type: 'object',
        description:
          '**Evento:** `room-invalid` → La sala solicitada no existe',
        properties: {
          message: {
            type: 'string',
            example: 'La sala no existe o el ID es inválido'
          }
        }
      },

      WS_UserJoined: {
        type: 'object',
        description:
          '**Evento:** `user-joined` → Notifica a otros usuarios que alguien se unió',
        properties: {
          username: { type: 'string', example: 'jhoan_dev' },
          uid: { type: 'string', example: 'user_uid_123' },
          activeUsers: {
            type: 'array',
            items: { $ref: '#/components/schemas/ActiveUser' }
          }
        }
      },

      WS_UserLeft: {
        type: 'object',
        description:
          '**Evento:** `user-left` → Notifica que un usuario dejó la sala',
        properties: {
          username: { type: 'string', example: 'jhoan_dev' },
          uid: { type: 'string', example: 'user_uid_123' },
          activeUsers: {
            type: 'array',
            items: { $ref: '#/components/schemas/ActiveUser' }
          }
        }
      },

      WS_SendMessage_Emit: {
        type: 'object',
        description:
          '**Evento:** `send-message` → Cliente envía un mensaje al servidor',
        properties: {
          roomId: { type: 'string', example: 'a3b-c4d5-e6f' },
          senderUid: { type: 'string', example: 'user_uid_123' },
          senderUsername: { type: 'string', example: 'jhoan_dev' },
          text: { type: 'string', example: '¡Hola a todos!' }
        },
        required: ['roomId', 'senderUid', 'senderUsername', 'text']
      },

      WS_ReceiveMessage: {
        type: 'object',
        description:
          '**Evento:** `receive-message` → Servidor emite mensaje a todos los usuarios de la sala',
        properties: {
          id: { type: 'string', example: 'firestore_doc_id' },
          roomId: { type: 'string', example: 'a3b-c4d5-e6f' },
          senderUid: { type: 'string', example: 'user_uid_123' },
          senderUsername: { type: 'string', example: 'jhoan_dev' },
          text: { type: 'string', example: '¡Hola a todos!' },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },

      WS_RoomHistory: {
        type: 'object',
        description:
          '**Evento:** `room-history` → Servidor envía el historial de mensajes al unirse a la sala',
        properties: {
          messages: {
            type: 'array',
            items: { $ref: '#/components/schemas/Message' }
          }
        }
      },

      WS_DeleteRoom_Emit: {
        type: 'object',
        description:
          '**Evento:** `delete-room` → Cliente solicita eliminar una sala (solo el host)',
        properties: {
          roomId: { type: 'string', example: 'a3b-c4d5-e6f' },
          uid: {
            type: 'string',
            description: 'UID del host que solicita la eliminación',
            example: 'host_uid_456'
          }
        },
        required: ['roomId', 'uid']
      },

      WS_RoomDeleted: {
        type: 'object',
        description:
          '**Evento:** `room-deleted` → Servidor notifica que la sala fue eliminada',
        properties: {
          message: {
            type: 'string',
            example: 'La sala ha sido eliminada por el host'
          },
          roomId: { type: 'string', example: 'a3b-c4d5-e6f' },
          uid: { type: 'string', example: 'host_uid_456' }
        }
      },

      WS_ErrorMsg: {
        type: 'object',
        description:
          '**Evento:** `error-msg` → Servidor envía un mensaje de error al cliente',
        properties: {
          message: {
            type: 'string',
            example: 'Datos incompletos para ingresar a la sala'
          }
        }
      }
    }
  },

  paths: {
    // ═══════════════════════════════════════════════
    //  HTTP Health
    // ═══════════════════════════════════════════════
    '/': {
      get: {
        tags: ['Health'],
        summary: 'Estado del servidor',
        description:
          'Retorna un mensaje para verificar que el servidor WebSocket está activo.',
        responses: {
          '200': {
            description: 'Servidor funcionando',
            content: {
              'text/plain': {
                schema: {
                  type: 'string',
                  example:
                    'Servidor Real-time de WebSockets funcionando en puerto 3001'
                }
              }
            }
          }
        }
      }
    },

    // ═══════════════════════════════════════════════
    //  WebSocket Events (documented as pseudo-endpoints)
    // ═══════════════════════════════════════════════
    '/ws/join-room': {
      post: {
        tags: ['WebSocket — Salas'],
        summary: '🔌 join-room',
        description:
          '**Evento Socket.IO:** `join-room`\n\n' +
          'El cliente emite este evento para unirse a una sala. El servidor valida que la sala exista ' +
          'en Firestore, agrega al usuario a la lista de presencia, y emite:\n' +
          '- `room-joined-success` al cliente que se unió\n' +
          '- `user-joined` a los demás usuarios de la sala\n' +
          '- `room-history` con el historial de mensajes\n' +
          '- `room-invalid` si la sala no existe\n\n' +
          '> ⚠️ **Este NO es un endpoint HTTP.** Se documenta aquí como referencia del evento WS.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WS_JoinRoom_Emit' }
            }
          }
        },
        responses: {
          '200': {
            description: '`room-joined-success` emitido al cliente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WS_RoomJoinedSuccess' }
              }
            }
          },
          '400': {
            description: '`room-invalid` o `error-msg` emitido al cliente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WS_RoomInvalid' }
              }
            }
          }
        }
      }
    },

    '/ws/send-message': {
      post: {
        tags: ['WebSocket — Mensajes'],
        summary: '🔌 send-message',
        description:
          '**Evento Socket.IO:** `send-message`\n\n' +
          'El cliente emite este evento para enviar un mensaje a una sala. ' +
          'El servidor guarda el mensaje en Firestore y emite `receive-message` a todos los usuarios de la sala.\n\n' +
          '> ⚠️ **Este NO es un endpoint HTTP.**',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WS_SendMessage_Emit' }
            }
          }
        },
        responses: {
          '200': {
            description: '`receive-message` broadcast a la sala',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WS_ReceiveMessage' }
              }
            }
          },
          '400': {
            description: '`error-msg` si faltan campos o el texto está vacío'
          }
        }
      }
    },

    '/ws/delete-room': {
      post: {
        tags: ['WebSocket — Salas'],
        summary: '🔌 delete-room',
        description:
          '**Evento Socket.IO:** `delete-room`\n\n' +
          'El host de la sala emite este evento para eliminarla. ' +
          'El servidor borra el documento en Firestore y emite `room-deleted` a todos los usuarios de la sala.\n\n' +
          '> ⚠️ **Este NO es un endpoint HTTP.**',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WS_DeleteRoom_Emit' }
            }
          }
        },
        responses: {
          '200': {
            description: '`room-deleted` broadcast a toda la sala',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WS_RoomDeleted' }
              }
            }
          },
          '400': {
            description: '`error-msg` si faltan campos'
          }
        }
      }
    },

    '/ws/disconnect': {
      post: {
        tags: ['WebSocket — Presencia'],
        summary: '🔌 disconnect',
        description:
          '**Evento Socket.IO:** `disconnect`\n\n' +
          'Se dispara automáticamente cuando un cliente se desconecta. ' +
          'El servidor elimina al usuario de la lista de presencia de todas las salas ' +
          'y emite `user-left` a los demás miembros.\n\n' +
          '> ⚠️ **Este NO es un endpoint HTTP.** Es un evento automático de Socket.IO.',
        responses: {
          '200': {
            description: '`user-left` emitido a la sala del usuario',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WS_UserLeft' }
              }
            }
          }
        }
      }
    }
  }
}

const swaggerSpec = swaggerJsdoc({
  definition: swaggerDefinition,
  apis: [] // All docs are inline above
})

export function setupSwagger(app: Express): void {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'MP2 Backend Real-Time — Swagger Docs'
    })
  )

  // Also expose the raw JSON spec
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json')
    res.send(swaggerSpec)
  })
}
