const API_SCOPES = ["services:read", "orders:create", "orders:read", "orders:cancel", "balance:read"];

export function openApiV1(origin = "https://linkboost-growth.onrender.com") {
  return {
    openapi: "3.0.3",
    info: {
      title: "LinkBoost Growth SMM API",
      version: "1.0.0",
      description:
        "REST API for approved developers. Orders use the same catalog, wallet, and provider infrastructure as the dashboard.",
    },
    servers: [{ url: `${origin.replace(/\/$/, "")}/api/v1` }],
    tags: [
      { name: "Services" },
      { name: "Orders" },
      { name: "Balance" },
      { name: "Webhooks" },
      { name: "Authentication" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "API Key" },
        apiKeyHeader: { type: "apiKey", in: "header", name: "API-Key" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
        Service: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            platform: { type: "string" },
            category: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            min: { type: "integer" },
            max: { type: "integer" },
            price: { type: "number" },
            delivery: { type: "string" },
            status: { type: "string" },
          },
        },
        Order: {
          type: "object",
          properties: {
            id: { type: "string", example: "LWH-20260813-ABC123" },
            service: { type: "string", format: "uuid" },
            quantity: { type: "integer" },
            target: { type: "string" },
            charge: { type: "number" },
            status: { type: "string" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
    paths: {
      "/services": {
        get: {
          tags: ["Services"],
          summary: "List API-available services",
          parameters: [
            { name: "platform", in: "query", schema: { type: "string" } },
            { name: "category", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: {
            200: { description: "Active services available through the API" },
            401: { description: "Invalid API key" },
          },
        },
      },
      "/balance": {
        get: {
          tags: ["Balance"],
          summary: "Get wallet balance",
          responses: { 200: { description: "Current wallet balance in GHS" } },
        },
      },
      "/orders": {
        get: {
          tags: ["Orders"],
          summary: "List orders",
          parameters: [
            { name: "status", in: "query", schema: { type: "string" } },
            { name: "from", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "to", in: "query", schema: { type: "string", format: "date-time" } },
            { name: "order_id", in: "query", schema: { type: "string" } },
            { name: "page", in: "query", schema: { type: "integer" } },
            { name: "limit", in: "query", schema: { type: "integer" } },
          ],
          responses: { 200: { description: "Paginated orders placed by this account" } },
        },
        post: {
          tags: ["Orders"],
          summary: "Create an order",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["service", "quantity", "target"],
                  properties: {
                    service: { type: "string", format: "uuid" },
                    quantity: { type: "integer" },
                    target: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Order created and wallet charged" } },
        },
      },
      "/orders/{order_id}": {
        get: {
          tags: ["Orders"],
          summary: "Get order status",
          parameters: [{ name: "order_id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Order details" } },
        },
      },
      "/orders/{order_id}/cancel": {
        post: {
          tags: ["Orders"],
          summary: "Cancel a pending order",
          parameters: [{ name: "order_id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Order cancelled and refunded when eligible" } },
        },
      },
      "/orders/{order_id}/refill": {
        post: {
          tags: ["Orders"],
          summary: "Request a refill",
          parameters: [{ name: "order_id", in: "path", required: true, schema: { type: "string" } }],
          responses: { 201: { description: "Refill requested when the product supports it" } },
        },
      },
    },
    "x-webhook-events": [
      "order.created",
      "order.processing",
      "order.completed",
      "order.partial",
      "order.failed",
      "order.refunded",
      "order.cancelled",
    ],
    "x-scopes": API_SCOPES,
  };
}
