/**
 * Static OpenAPI 3.0 Specification for the VETTR API
 *
 * This file documents all public-facing endpoints. When adding new routes,
 * update the corresponding paths section here to keep the spec in sync.
 *
 * Excluded: Admin CRUD factory routes, Cron routes (internal)
 */

export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'VETTR API',
    version: '2.0.0',
    description:
      'VETTR Backend API — AI-powered stock due diligence for Canadian small-cap investors.\n\n' +
      '## Authentication\n\n' +
      'Most endpoints require JWT authentication via Bearer token:\n' +
      '```\nAuthorization: Bearer <access_token>\n```\n\n' +
      'Access tokens (15 min) are obtained from `/auth/login`, `/auth/signup`, `/auth/google`, or `/auth/apple`.\n' +
      'Refresh tokens (30 days, with rotation) are used at `/auth/refresh`.\n\n' +
      '## Rate Limiting\n\n' +
      '| Tier | Read | Write |\n' +
      '|------|------|-------|\n' +
      '| Unauthenticated | 5/min | N/A |\n' +
      '| Free | 60/min | 30/min |\n' +
      '| Pro | 120/min | 60/min |\n' +
      '| Premium | 300/min | 120/min |\n\n' +
      'Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`\n\n' +
      '## VETR Score V2 — 4-Pillar System\n\n' +
      '| Pillar | Weight | Sub-Metrics |\n' +
      '|--------|--------|-------------|\n' +
      '| Financial Survival | 35% | Cash Runway, Solvency |\n' +
      '| Operational Efficiency | 25% | Sector-specific efficiency ratio |\n' +
      '| Shareholder Structure | 25% | Pedigree, Dilution, SEDI Insider, Warrant Overhang |\n' +
      '| Market Sentiment | 15% | Liquidity, Technical Momentum, News, Short Squeeze, Analyst Consensus |\n\n' +
      'Pillars with insufficient data are excluded and their weights redistributed.\n\n' +
      '## Error Format\n\n' +
      '```json\n{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." }, "meta": { "timestamp": "...", "request_id": "..." } }\n```\n\n' +
      'Codes: `AUTH_REQUIRED`, `AUTH_EXPIRED`, `AUTH_INVALID_CREDENTIALS`, `FORBIDDEN`, `TIER_LIMIT_EXCEEDED`, `NOT_FOUND`, `CONFLICT`, `VALIDATION_ERROR`, `RATE_LIMITED`, `INTERNAL_ERROR`',
  },
  servers: [
    { url: 'https://vettr-backend.vercel.app/v1', description: 'Production' },
    { url: '/v1', description: 'Relative' },
  ],
  tags: [
    { name: 'health', description: 'Health check' },
    { name: 'auth', description: 'Authentication and authorization' },
    { name: 'stocks', description: 'Stock data, search, and detail' },
    { name: 'filings', description: 'Regulatory filings' },
    { name: 'executives', description: 'Executive team information' },
    { name: 'vetr-score', description: 'VETR Score V2 — 4-pillar calculation, history, trend, and comparison' },
    { name: 'red-flags', description: 'Red Flag detection and analysis' },
    { name: 'alerts', description: 'Alert rules and triggered notifications' },
    { name: 'watchlist', description: 'User watchlist management' },
    { name: 'sync', description: 'Offline sync for mobile clients' },
    { name: 'users', description: 'User profile and settings' },
    { name: 'subscription', description: 'Subscription tier and limits' },
    { name: 'pulse', description: 'Portfolio pulse dashboard' },
    { name: 'portfolio', description: 'Portfolio connections, holdings, and management' },
    { name: 'news', description: 'News articles and filing calendar' },
    { name: 'ai-agent', description: 'AI-powered stock analysis with tiered daily limits' },
    { name: 'devices', description: 'Push notification device tokens' },
    { name: 'portfolio-alerts', description: 'Portfolio-centric auto-generated alerts' },
    { name: 'portfolio-insights', description: 'AI insight modules for portfolio holdings' },
    { name: 'public', description: 'Public endpoints — no authentication required' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http' as const,
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token from /auth/login, /auth/signup, /auth/google, or /auth/apple',
      },
    },
    schemas: {
      // ── Response Wrappers ──────────────────────────────────
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'NOT_FOUND' },
              message: { type: 'string', example: 'Resource not found' },
              details: { type: 'object', nullable: true },
            },
          },
          meta: {
            type: 'object',
            properties: {
              timestamp: { type: 'string', format: 'date-time' },
              request_id: { type: 'string', format: 'uuid' },
            },
          },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          limit: { type: 'integer' },
          offset: { type: 'integer' },
          has_more: { type: 'boolean' },
        },
      },
      // ── Auth ────────────────────────────────────────────────
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          display_name: { type: 'string' },
          avatar_url: { type: 'string', nullable: true },
          tier: { type: 'string', enum: ['free', 'pro', 'premium'] },
          auth_provider: { type: 'string', enum: ['email', 'google', 'apple'] },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      AuthTokenResponse: {
        type: 'object',
        properties: {
          access_token: { type: 'string' },
          refresh_token: { type: 'string' },
          token_type: { type: 'string', example: 'Bearer' },
          expires_in: { type: 'integer', example: 900, description: 'Seconds until access token expires' },
          user: { $ref: '#/components/schemas/UserProfile' },
        },
      },
      // ── Stocks ──────────────────────────────────────────────
      StockAutocomplete: {
        type: 'object',
        properties: {
          ticker: { type: 'string', example: 'BTO.TO' },
          company_name: { type: 'string', example: 'B2Gold Corp' },
          exchange: { type: 'string', example: 'TSX' },
          sector: { type: 'string', example: 'Gold' },
        },
      },
      StockListItem: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          ticker: { type: 'string' },
          company_name: { type: 'string' },
          exchange: { type: 'string' },
          sector: { type: 'string' },
          market_cap: { type: 'number', nullable: true },
          current_price: { type: 'number', nullable: true },
          price_change_percent: { type: 'number', nullable: true },
          vetr_score: { type: 'integer', nullable: true, minimum: 0, maximum: 100 },
          last_updated: { type: 'string', format: 'date-time' },
        },
      },
      StockPreview: {
        type: 'object',
        description: 'Public stock preview with V2 pillar scores',
        properties: {
          ticker: { type: 'string' },
          company_name: { type: 'string' },
          exchange: { type: 'string' },
          sector: { type: 'string' },
          market_cap: { type: 'number', nullable: true },
          current_price: { type: 'number', nullable: true },
          price_change_percent: { type: 'number', nullable: true },
          vetr_score: { type: 'integer', nullable: true },
          pillars: {
            type: 'object',
            properties: {
              financial_survival: { type: 'object', properties: { score: { type: 'integer' }, weight: { type: 'number' } } },
              operational_efficiency: { type: 'object', properties: { score: { type: 'integer' }, weight: { type: 'number' } } },
              shareholder_structure: { type: 'object', properties: { score: { type: 'integer' }, weight: { type: 'number' } } },
              market_sentiment: { type: 'object', properties: { score: { type: 'integer' }, weight: { type: 'number' } } },
            },
          },
          null_pillars: { type: 'array', items: { type: 'string' } },
          is_preview: { type: 'boolean', example: true },
        },
      },
      // ── VETR Score V2 ──────────────────────────────────────
      VetrScoreResult: {
        type: 'object',
        description: 'VETR Score V2 with 4-pillar breakdown. Pillars with insufficient data are null and weights redistributed.',
        properties: {
          ticker: { type: 'string', example: 'NXE' },
          overall_score: { type: 'integer', minimum: 0, maximum: 100 },
          components: {
            type: 'object',
            properties: {
              financial_survival: {
                type: 'object',
                description: 'P1 (base 35%): Cash Runway + Solvency',
                properties: {
                  score: { type: 'integer', minimum: 0, maximum: 100 },
                  weight: { type: 'number', description: 'Adjusted weight after null redistribution', example: 0.35 },
                  sub_scores: {
                    type: 'object',
                    properties: {
                      cash_runway: { type: 'integer', description: 'Months of cash → 0-100. FCF-positive = 100.' },
                      solvency: { type: 'integer', description: 'Inverted debt-to-assets. No debt = 100.' },
                    },
                  },
                },
              },
              operational_efficiency: {
                type: 'object',
                description: 'P2 (base 25%): Sector-specific operational ratio',
                properties: {
                  score: { type: 'integer', minimum: 0, maximum: 100 },
                  weight: { type: 'number', example: 0.25 },
                  sub_scores: {
                    type: 'object',
                    properties: {
                      efficiency_ratio: { type: 'number', description: 'Mining: exploration/opex, Tech: R&D/opex, General: gross profit/revenue' },
                    },
                  },
                },
              },
              shareholder_structure: {
                type: 'object',
                description: 'P3 (base 25%): Pedigree + Dilution + SEDI + Warrants',
                properties: {
                  score: { type: 'integer', minimum: 0, maximum: 100 },
                  weight: { type: 'number', example: 0.25 },
                  sub_scores: {
                    type: 'object',
                    properties: {
                      pedigree: { type: 'integer', minimum: 0, maximum: 100 },
                      dilution_penalty: { type: 'integer', minimum: 0, maximum: 100 },
                      sedi_insider_conviction: { type: 'integer', minimum: 0, maximum: 100 },
                      warrant_overhang: { type: 'integer', minimum: 0, maximum: 100 },
                    },
                  },
                },
              },
              market_sentiment: {
                type: 'object',
                description: 'P4 (base 15%): Liquidity + Technical + News + Short Squeeze + Analyst',
                properties: {
                  score: { type: 'integer', minimum: 0, maximum: 100 },
                  weight: { type: 'number', example: 0.15 },
                  sub_scores: {
                    type: 'object',
                    properties: {
                      liquidity: { type: 'integer', minimum: 0, maximum: 100 },
                      technical_momentum: { type: 'integer', minimum: 0, maximum: 100 },
                      news_velocity: { type: 'integer', minimum: 0, maximum: 100 },
                      short_squeeze: { type: 'integer', minimum: 0, maximum: 100 },
                      analyst_consensus: { type: 'integer', minimum: 0, maximum: 100 },
                    },
                  },
                },
              },
            },
          },
          null_pillars: { type: 'array', items: { type: 'string' }, example: ['operational_efficiency'] },
          calculated_at: { type: 'string', format: 'date-time' },
        },
      },
      ScoreHistoryEntry: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          stock_ticker: { type: 'string' },
          overall_score: { type: 'integer' },
          financial_survival_score: { type: 'integer', nullable: true },
          operational_efficiency_score: { type: 'integer', nullable: true },
          shareholder_structure_score: { type: 'integer', nullable: true },
          market_sentiment_score: { type: 'integer', nullable: true },
          calculated_at: { type: 'string', format: 'date-time' },
        },
      },
      // ── Filing ──────────────────────────────────────────────
      Filing: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          stock_id: { type: 'string', format: 'uuid' },
          ticker: { type: 'string' },
          company_name: { type: 'string' },
          type: { type: 'string' },
          title: { type: 'string' },
          date_filed: { type: 'string', format: 'date-time' },
          summary: { type: 'string', nullable: true },
          is_material: { type: 'boolean' },
          is_read: { type: 'boolean' },
          source_url: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      // ── Executive ───────────────────────────────────────────
      Executive: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          stock_id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          title: { type: 'string' },
          years_at_company: { type: 'number', nullable: true },
          previous_companies: { type: 'array', items: { type: 'string' } },
          education: { type: 'string', nullable: true },
          specialization: { type: 'string', nullable: true },
          social_linkedin: { type: 'string', nullable: true },
          social_twitter: { type: 'string', nullable: true },
        },
      },
      // ── Red Flags ───────────────────────────────────────────
      RedFlagEntry: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          stock_ticker: { type: 'string' },
          flag_type: { type: 'string' },
          severity: { type: 'string', enum: ['Low', 'Moderate', 'High', 'Critical'] },
          score: { type: 'number' },
          description: { type: 'string' },
          detected_at: { type: 'string', format: 'date-time' },
          is_acknowledged: { type: 'boolean' },
        },
      },
      // ── Alert Rule ──────────────────────────────────────────
      AlertRule: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          stock_ticker: { type: 'string' },
          rule_type: { type: 'string' },
          trigger_conditions: { type: 'object', nullable: true },
          condition_operator: { type: 'string', nullable: true },
          frequency: { type: 'string', nullable: true },
          threshold: { type: 'number', nullable: true },
          is_active: { type: 'boolean' },
          created_at: { type: 'string', format: 'date-time' },
          last_triggered_at: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      TriggeredAlert: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          stock_ticker: { type: 'string' },
          alert_type: { type: 'string' },
          title: { type: 'string' },
          message: { type: 'string' },
          triggered_at: { type: 'string', format: 'date-time' },
          is_read: { type: 'boolean' },
          rule_id: { type: 'string', format: 'uuid', nullable: true },
        },
      },
      // ── Portfolio ───────────────────────────────────────────
      PortfolioConnection: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          user_id: { type: 'string', format: 'uuid' },
          connection_type: { type: 'string', enum: ['flinks', 'snaptrade', 'csv', 'manual'] },
          connection_id: { type: 'string', nullable: true },
          institution_name: { type: 'string', nullable: true },
          connection_status: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      PortfolioHolding: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          portfolio_id: { type: 'string', format: 'uuid' },
          ticker: { type: 'string' },
          company_name: { type: 'string', nullable: true },
          quantity: { type: 'number' },
          average_cost: { type: 'number' },
          current_price: { type: 'number', nullable: true },
          market_value: { type: 'number', nullable: true },
          gain_loss: { type: 'number', nullable: true },
          gain_loss_percent: { type: 'number', nullable: true },
          asset_category: { type: 'string', nullable: true },
          vetr_score: { type: 'integer', nullable: true },
        },
      },
      // ── Subscription ────────────────────────────────────────
      Subscription: {
        type: 'object',
        properties: {
          tier: { type: 'string', enum: ['free', 'pro', 'premium'] },
          watchlist_limit: { type: 'integer' },
          stocks_tracked_count: { type: 'integer' },
          features: { type: 'object' },
          limits: { type: 'object' },
        },
      },
      // ── News ────────────────────────────────────────────────
      NewsArticle: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          summary: { type: 'string', nullable: true },
          source: { type: 'string' },
          url: { type: 'string' },
          published_at: { type: 'string', format: 'date-time' },
          is_material: { type: 'boolean' },
          tickers: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  paths: {
    // ════════════════════════════════════════════════════════════
    // HEALTH
    // ════════════════════════════════════════════════════════════
    '/health': {
      get: {
        tags: ['health'],
        summary: 'Health check',
        description: 'Returns API health status including database and Redis connectivity.',
        responses: {
          '200': { description: 'Healthy', content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', example: 'ok' }, uptime: { type: 'number' }, database: { type: 'string' }, redis: { type: 'string' } } } } } },
        },
      },
    },

    // ════════════════════════════════════════════════════════════
    // AUTH
    // ════════════════════════════════════════════════════════════
    '/auth/signup': {
      post: {
        tags: ['auth'],
        summary: 'Create new account',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 }, display_name: { type: 'string' } } } } } },
        responses: { '201': { description: 'Account created', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/AuthTokenResponse' } } } } } }, '409': { description: 'Email already exists' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'Authenticate with email/password',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } } } } },
        responses: { '200': { description: 'Authenticated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/AuthTokenResponse' } } } } } }, '401': { description: 'Invalid credentials' } },
      },
    },
    '/auth/google': {
      post: {
        tags: ['auth'],
        summary: 'Authenticate with Google OAuth',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['id_token'], properties: { id_token: { type: 'string' } } } } } },
        responses: { '200': { description: 'Authenticated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/AuthTokenResponse' } } } } } } },
      },
    },
    '/auth/apple': {
      post: {
        tags: ['auth'],
        summary: 'Authenticate with Apple Sign In',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['identity_token', 'authorization_code'], properties: { identity_token: { type: 'string' }, authorization_code: { type: 'string' }, user: { type: 'object', properties: { firstName: { type: 'string' }, lastName: { type: 'string' } } } } } } } },
        responses: { '200': { description: 'Authenticated', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/AuthTokenResponse' } } } } } } },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['auth'],
        summary: 'Refresh access token',
        description: 'Exchange a refresh token for a new access/refresh token pair. The old refresh token is revoked (rotation).',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refresh_token'], properties: { refresh_token: { type: 'string' } } } } } },
        responses: { '200': { description: 'Tokens refreshed', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/AuthTokenResponse' } } } } } }, '401': { description: 'Invalid or expired refresh token' } },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['auth'],
        summary: 'Revoke refresh token',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refresh_token'], properties: { refresh_token: { type: 'string' } } } } } },
        responses: { '200': { description: 'Logged out' } },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['auth'],
        summary: 'Request password reset email',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } } },
        responses: { '200': { description: 'Email sent (safe response regardless of whether email exists)' } },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['auth'],
        summary: 'Reset password using email token',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token', 'password'], properties: { token: { type: 'string' }, password: { type: 'string', minLength: 8 } } } } } },
        responses: { '200': { description: 'Password reset' }, '401': { description: 'Invalid or expired token' } },
      },
    },
    '/auth/change-password': {
      post: {
        tags: ['auth'],
        summary: 'Change password (authenticated)',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['current_password', 'new_password'], properties: { current_password: { type: 'string' }, new_password: { type: 'string', minLength: 8 } } } } } },
        responses: { '200': { description: 'Password changed' }, '401': { description: 'Current password incorrect' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // STOCKS
    // ════════════════════════════════════════════════════════════
    '/stocks/autocomplete': {
      get: {
        tags: ['stocks'],
        summary: 'Ticker/name autocomplete (public)',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 1 }, description: 'Search query' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 8 } },
        ],
        responses: { '200': { description: 'Autocomplete results', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/StockAutocomplete' } } } } } } } },
      },
    },
    '/stocks/sectors': {
      get: {
        tags: ['stocks'],
        summary: 'Get distinct sector values (public)',
        responses: { '200': { description: 'Sector list', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { type: 'string' } } } } } } } },
      },
    },
    '/stocks': {
      get: {
        tags: ['stocks'],
        summary: 'List stocks with pagination, filtering, and sorting',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          { name: 'sector', in: 'query', schema: { type: 'string' } },
          { name: 'exchange', in: 'query', schema: { type: 'string' } },
          { name: 'sort', in: 'query', schema: { type: 'string', enum: ['ticker', 'name', 'vetr_score', 'market_cap', 'price'] } },
          { name: 'order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Paginated stocks', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/StockListItem' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } } } } },
      },
    },
    '/stocks/search': {
      get: {
        tags: ['stocks'],
        summary: 'Search stocks by name or ticker',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 50 } },
        ],
        responses: { '200': { description: 'Search results', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/StockListItem' } } } } } } } },
      },
    },
    '/stocks/{ticker}/preview': {
      get: {
        tags: ['stocks'],
        summary: 'Public stock preview with pillar scores',
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' }, example: 'NXE' }],
        responses: { '200': { description: 'Stock preview', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/StockPreview' } } } } } }, '404': { description: 'Stock not found' } },
      },
    },
    '/stocks/{ticker}': {
      get: {
        tags: ['stocks'],
        summary: 'Full stock detail with executives and filings',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Stock detail' }, '404': { description: 'Stock not found' } },
      },
    },
    '/stocks/{ticker}/filings': {
      get: {
        tags: ['stocks'],
        summary: 'Get filings for a stock',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'ticker', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Paginated filings', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Filing' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } } } } },
      },
    },
    '/stocks/{ticker}/executives': {
      get: {
        tags: ['stocks'],
        summary: 'Get executives for a stock',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Executive list', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/Executive' } } } } } } } },
      },
    },
    '/stocks/{ticker}/fundamentals': {
      get: {
        tags: ['stocks'],
        summary: 'Comprehensive fundamentals from 16+ data tables',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Fundamentals data' }, '404': { description: 'Stock not found' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // FILINGS
    // ════════════════════════════════════════════════════════════
    '/filings': {
      get: {
        tags: ['filings'],
        summary: 'List latest filings',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': { description: 'Paginated filings', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/Filing' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } } } } },
      },
    },
    '/filings/{id}': {
      get: {
        tags: ['filings'],
        summary: 'Get filing detail with per-user read status',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Filing detail', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/Filing' } } } } } } },
      },
    },
    '/filings/{id}/read': {
      post: {
        tags: ['filings'],
        summary: 'Mark filing as read',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Marked as read' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // EXECUTIVES
    // ════════════════════════════════════════════════════════════
    '/executives/search': {
      get: {
        tags: ['executives'],
        summary: 'Search executives by name',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 50 } },
        ],
        responses: { '200': { description: 'Executive results', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/Executive' } } } } } } } },
      },
    },
    '/executives/{id}': {
      get: {
        tags: ['executives'],
        summary: 'Get executive detail',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Executive detail', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/Executive' } } } } } } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // VETR SCORE V2
    // ════════════════════════════════════════════════════════════
    '/stocks/{ticker}/vetr-score': {
      get: {
        tags: ['vetr-score'],
        summary: 'Get current VETR Score with 4-pillar breakdown',
        description: 'Returns the V2 score with all pillar components, sub-scores, and null pillar handling.',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' }, example: 'NXE' }],
        responses: { '200': { description: 'VETR Score', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/VetrScoreResult' } } } } } }, '404': { description: 'Stock not found' } },
      },
    },
    '/stocks/{ticker}/vetr-score/history': {
      get: {
        tags: ['vetr-score'],
        summary: 'Get score history',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'ticker', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'months', in: 'query', schema: { type: 'integer', default: 6, minimum: 1, maximum: 24 } },
        ],
        responses: { '200': { description: 'Score history', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/ScoreHistoryEntry' } } } } } } } },
      },
    },
    '/stocks/{ticker}/vetr-score/chart': {
      get: {
        tags: ['vetr-score'],
        summary: 'Score time-series for charting',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'ticker', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'range', in: 'query', schema: { type: 'string', enum: ['24h', '7d', '30d', '90d'], default: '7d' } },
        ],
        responses: { '200': { description: 'Chart data points' } },
      },
    },
    '/stocks/{ticker}/vetr-score/trend': {
      get: {
        tags: ['vetr-score'],
        summary: 'Score trend analysis',
        description: 'Returns trend direction, momentum, and 30d/90d score changes.',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Trend analysis' } },
      },
    },
    '/stocks/{ticker}/vetr-score/compare': {
      get: {
        tags: ['vetr-score'],
        summary: 'Sector peer comparison',
        description: 'Compare score against sector peers with percentile rank.',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Peer comparison' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // RED FLAGS
    // ════════════════════════════════════════════════════════════
    '/stocks/{ticker}/red-flags': {
      get: {
        tags: ['red-flags'],
        summary: 'Detect red flags for a stock',
        description: 'Returns composite score, severity breakdown, and individual detected flags.',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Red flag analysis' } },
      },
    },
    '/stocks/{ticker}/red-flags/history': {
      get: {
        tags: ['red-flags'],
        summary: 'Red flag history for a stock',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'ticker', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': { description: 'Paginated flag history' } },
      },
    },
    '/stocks/{ticker}/red-flags/acknowledge-all': {
      post: {
        tags: ['red-flags'],
        summary: 'Acknowledge all red flags for a stock',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'All flags acknowledged' } },
      },
    },
    '/red-flags/trend': {
      get: {
        tags: ['red-flags'],
        summary: 'Global red flag trend stats',
        description: 'Total active flags, 30-day change, breakdown by severity and type.',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Trend statistics' } },
      },
    },
    '/red-flags/history': {
      get: {
        tags: ['red-flags'],
        summary: 'Global recent red flags',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': { description: 'Paginated red flags' } },
      },
    },
    '/red-flags/{id}/acknowledge': {
      post: {
        tags: ['red-flags'],
        summary: 'Acknowledge a single red flag',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Flag acknowledged' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // ALERTS
    // ════════════════════════════════════════════════════════════
    '/alerts': {
      get: {
        tags: ['alerts'],
        summary: 'List triggered alerts',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'unread_only', in: 'query', schema: { type: 'boolean' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': { description: 'Paginated alerts', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/TriggeredAlert' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } } } } },
      },
    },
    '/alerts/unread-count': {
      get: {
        tags: ['alerts'],
        summary: 'Get unread alert count',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Count', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { unread_count: { type: 'integer' } } } } } } } } },
      },
    },
    '/alerts/read-all': {
      post: {
        tags: ['alerts'],
        summary: 'Mark all alerts as read',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'All marked read' } },
      },
    },
    '/alerts/{id}/read': {
      post: {
        tags: ['alerts'],
        summary: 'Mark a single alert as read',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Alert marked read' } },
      },
    },
    '/alerts/{id}': {
      delete: {
        tags: ['alerts'],
        summary: 'Delete a triggered alert',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Alert deleted' } },
      },
    },
    '/alerts/rules': {
      get: {
        tags: ['alerts'],
        summary: 'List alert rules',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Alert rules', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/AlertRule' } } } } } } } },
      },
      post: {
        tags: ['alerts'],
        summary: 'Create alert rule',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['stock_ticker', 'rule_type'], properties: { stock_ticker: { type: 'string' }, rule_type: { type: 'string' }, trigger_conditions: { type: 'object' }, condition_operator: { type: 'string' }, frequency: { type: 'string' }, threshold: { type: 'number' } } } } } },
        responses: { '201': { description: 'Rule created' } },
      },
    },
    '/alerts/rules/{id}': {
      put: {
        tags: ['alerts'],
        summary: 'Update alert rule',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { rule_type: { type: 'string' }, trigger_conditions: { type: 'object' }, condition_operator: { type: 'string' }, frequency: { type: 'string' }, threshold: { type: 'number' }, is_active: { type: 'boolean' } } } } } },
        responses: { '200': { description: 'Rule updated' } },
      },
      delete: {
        tags: ['alerts'],
        summary: 'Delete alert rule',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Rule deleted' } },
      },
    },
    '/alerts/rules/{id}/enable': {
      post: {
        tags: ['alerts'],
        summary: 'Enable alert rule',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Rule enabled' } },
      },
    },
    '/alerts/rules/{id}/disable': {
      post: {
        tags: ['alerts'],
        summary: 'Disable alert rule',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Rule disabled' } },
      },
    },
    '/alerts/stocks/{ticker}/rules': {
      get: {
        tags: ['alerts'],
        summary: 'Get alert rules for a specific stock',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Stock alert rules', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/AlertRule' } } } } } } } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // WATCHLIST
    // ════════════════════════════════════════════════════════════
    '/watchlist': {
      get: {
        tags: ['watchlist'],
        summary: 'Get watchlist with full stock data',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Watchlist items' } },
      },
    },
    '/watchlist/{ticker}': {
      post: {
        tags: ['watchlist'],
        summary: 'Add stock to watchlist',
        description: 'Validates against tier watchlist limit (Free: 5, Pro: 25, Premium: unlimited).',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '201': { description: 'Added' }, '403': { description: 'Watchlist limit exceeded for tier' } },
      },
      delete: {
        tags: ['watchlist'],
        summary: 'Remove stock from watchlist',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Removed' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // SYNC
    // ════════════════════════════════════════════════════════════
    '/sync/pull': {
      post: {
        tags: ['sync'],
        summary: 'Pull changes since last sync',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['last_synced_at', 'entities'], properties: { last_synced_at: { type: 'string', format: 'date-time' }, entities: { type: 'array', items: { type: 'string', enum: ['stocks', 'filings', 'alert_rules'] } } } } } } },
        responses: { '200': { description: 'Changes since timestamp' } },
      },
    },
    '/sync/push': {
      post: {
        tags: ['sync'],
        summary: 'Push local changes',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['changes'], properties: { changes: { type: 'array', items: { type: 'object', properties: { entity: { type: 'string' }, action: { type: 'string' }, data: { type: 'object' }, timestamp: { type: 'string', format: 'date-time' }, id: { type: 'string' } } } } } } } } },
        responses: { '200': { description: 'Push result with any conflicts' } },
      },
    },
    '/sync/resolve': {
      post: {
        tags: ['sync'],
        summary: 'Resolve sync conflicts',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['resolutions'], properties: { resolutions: { type: 'array', items: { type: 'object', properties: { entity: { type: 'string' }, id: { type: 'string' }, strategy: { type: 'string', enum: ['local_wins', 'server_wins', 'last_write_wins'] } } } } } } } } },
        responses: { '200': { description: 'Conflicts resolved' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // USERS
    // ════════════════════════════════════════════════════════════
    '/users/me': {
      get: {
        tags: ['users'],
        summary: 'Get current user profile',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'User profile', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/UserProfile' } } } } } } },
      },
      put: {
        tags: ['users'],
        summary: 'Update profile',
        security: [{ BearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { display_name: { type: 'string' }, avatar_url: { type: 'string' } } } } } },
        responses: { '200': { description: 'Profile updated' } },
      },
    },
    '/users/me/settings': {
      get: {
        tags: ['users'],
        summary: 'Get user settings',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Settings JSON' } },
      },
      put: {
        tags: ['users'],
        summary: 'Update user settings',
        description: 'Merges provided settings with existing settings.',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', description: 'Arbitrary settings JSON' } } } },
        responses: { '200': { description: 'Settings merged' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // SUBSCRIPTION
    // ════════════════════════════════════════════════════════════
    '/subscription': {
      get: {
        tags: ['subscription'],
        summary: 'Get current tier, limits, and features',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Subscription info', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/Subscription' } } } } } } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // PULSE
    // ════════════════════════════════════════════════════════════
    '/pulse/summary': {
      get: {
        tags: ['pulse'],
        summary: 'Portfolio pulse dashboard',
        description: 'Aggregated watchlist health, sector exposure, and red flag categories. Cached 5 minutes.',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Pulse summary' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // PORTFOLIO
    // ════════════════════════════════════════════════════════════
    '/portfolio': {
      post: {
        tags: ['portfolio'],
        summary: 'Create a portfolio connection',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['connectionType'], properties: { connectionType: { type: 'string', enum: ['flinks', 'snaptrade', 'csv', 'manual'] }, connectionId: { type: 'string' }, institutionName: { type: 'string' } } } } } },
        responses: { '201': { description: 'Portfolio created', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/PortfolioConnection' } } } } } } },
      },
      get: {
        tags: ['portfolio'],
        summary: 'List all portfolios',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Portfolio list' } },
      },
    },
    '/portfolio/summary': {
      get: {
        tags: ['portfolio'],
        summary: 'Aggregated portfolio summary with P&L',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Portfolio summary' } },
      },
    },
    '/portfolio/holdings': {
      get: {
        tags: ['portfolio'],
        summary: 'All holdings across all portfolios',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Holdings list', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/PortfolioHolding' } } } } } } } },
      },
    },
    '/portfolio/holdings/categorized': {
      get: {
        tags: ['portfolio'],
        summary: 'Holdings grouped by asset category',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Categorized holdings' } },
      },
    },
    '/portfolio/{id}': {
      get: {
        tags: ['portfolio'],
        summary: 'Get a single portfolio',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Portfolio detail' } },
      },
      delete: {
        tags: ['portfolio'],
        summary: 'Delete portfolio and holdings',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/portfolio/{id}/holdings': {
      post: {
        tags: ['portfolio'],
        summary: 'Add a holding',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['ticker', 'quantity', 'averageCost'], properties: { ticker: { type: 'string' }, quantity: { type: 'number' }, averageCost: { type: 'number' }, assetCategory: { type: 'string' } } } } } },
        responses: { '201': { description: 'Holding created' } },
      },
      get: {
        tags: ['portfolio'],
        summary: 'Get holdings for a portfolio',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Holdings list' } },
      },
    },
    '/portfolio/holdings/{holdingId}': {
      delete: {
        tags: ['portfolio'],
        summary: 'Remove a holding',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'holdingId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Holding removed' } },
      },
    },
    '/portfolio/{id}/snapshots': {
      get: {
        tags: ['portfolio'],
        summary: 'Portfolio value snapshots for charts',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'days', in: 'query', schema: { type: 'integer', default: 30 } },
        ],
        responses: { '200': { description: 'Snapshot data' } },
      },
    },
    '/portfolio/{id}/import-csv': {
      post: {
        tags: ['portfolio'],
        summary: 'Import holdings from CSV data',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['rows'], properties: { rows: { type: 'array', items: { type: 'object', properties: { ticker: { type: 'string' }, shares: { type: 'number' }, avgCost: { type: 'number' } } } } } } } } },
        responses: { '200': { description: 'Import results' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // NEWS
    // ════════════════════════════════════════════════════════════
    '/news': {
      get: {
        tags: ['news'],
        summary: 'List news articles',
        parameters: [
          { name: 'source', in: 'query', schema: { type: 'string' } },
          { name: 'ticker', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': { description: 'News articles', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/NewsArticle' } }, pagination: { $ref: '#/components/schemas/Pagination' } } } } } } } } },
      },
    },
    '/news/material': {
      get: {
        tags: ['news'],
        summary: 'Get material (significant) news',
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }],
        responses: { '200': { description: 'Material news' } },
      },
    },
    '/news/filings': {
      get: {
        tags: ['news'],
        summary: 'Upcoming filing calendar',
        parameters: [
          { name: 'ticker', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'days', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'Filing calendar entries' } },
      },
    },
    '/news/filings/overdue': {
      get: {
        tags: ['news'],
        summary: 'Overdue filings',
        responses: { '200': { description: 'Overdue filings' } },
      },
    },
    '/news/portfolio': {
      get: {
        tags: ['news'],
        summary: 'News for portfolio tickers',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'tickers', in: 'query', required: true, schema: { type: 'string' }, description: 'Comma-separated tickers' }],
        responses: { '200': { description: 'Portfolio news' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // AI AGENT
    // ════════════════════════════════════════════════════════════
    '/ai-agent/questions': {
      get: {
        tags: ['ai-agent'],
        summary: 'Get available AI questions',
        description: 'Returns initial questions or follow-ups if parent_id is provided.',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'parent_id', in: 'query', schema: { type: 'string' }, description: 'Parent question ID for follow-ups' }],
        responses: { '200': { description: 'Available questions' } },
      },
    },
    '/ai-agent/ask': {
      post: {
        tags: ['ai-agent'],
        summary: 'Ask the AI agent a question',
        description: 'Daily limits: Free (3), Pro (15), Premium (unlimited).',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['question_id', 'ticker'], properties: { question_id: { type: 'string' }, ticker: { type: 'string' } } } } } },
        responses: { '200': { description: 'AI response with follow-up questions' }, '403': { description: 'Daily limit exceeded' } },
      },
    },
    '/ai-agent/usage': {
      get: {
        tags: ['ai-agent'],
        summary: 'Get daily AI usage stats',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Usage stats', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { used: { type: 'integer' }, limit: { type: 'integer' }, remaining: { type: 'integer' }, resets_at: { type: 'string', format: 'date-time' } } } } } } } } },
      },
    },
    '/ai-agent/portfolio-context': {
      get: {
        tags: ['ai-agent'],
        summary: 'Portfolio context for AI analysis',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Portfolio summary, holdings, insights, alerts' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // DEVICES
    // ════════════════════════════════════════════════════════════
    '/devices/register': {
      post: {
        tags: ['devices'],
        summary: 'Register device for push notifications',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['platform', 'token'], properties: { platform: { type: 'string', enum: ['ios', 'android', 'web'] }, token: { type: 'string' } } } } } },
        responses: { '200': { description: 'Device registered' } },
      },
    },
    '/devices/unregister': {
      delete: {
        tags: ['devices'],
        summary: 'Unregister device token',
        security: [{ BearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } } } },
        responses: { '200': { description: 'Device unregistered' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // PORTFOLIO ALERTS
    // ════════════════════════════════════════════════════════════
    '/portfolio-alerts': {
      get: {
        tags: ['portfolio-alerts'],
        summary: 'List portfolio alerts',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'unread_only', in: 'query', schema: { type: 'boolean' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { '200': { description: 'Paginated portfolio alerts' } },
      },
    },
    '/portfolio-alerts/unread-count': {
      get: {
        tags: ['portfolio-alerts'],
        summary: 'Get unread portfolio alert count',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Unread count' } },
      },
    },
    '/portfolio-alerts/mark-all-read': {
      post: {
        tags: ['portfolio-alerts'],
        summary: 'Mark all portfolio alerts as read',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'All marked read' } },
      },
    },
    '/portfolio-alerts/{id}/read': {
      post: {
        tags: ['portfolio-alerts'],
        summary: 'Mark a portfolio alert as read',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Marked read' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // PORTFOLIO INSIGHTS
    // ════════════════════════════════════════════════════════════
    '/portfolio-insights': {
      get: {
        tags: ['portfolio-insights'],
        summary: 'Get all AI insights across portfolios',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'All insights' } },
      },
    },
    '/portfolio-insights/{portfolioId}': {
      get: {
        tags: ['portfolio-insights'],
        summary: 'Get insights for a specific portfolio',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'portfolioId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Portfolio insights' } },
      },
    },
    '/portfolio-insights/{insightId}/dismiss': {
      post: {
        tags: ['portfolio-insights'],
        summary: 'Dismiss an insight',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'insightId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Insight dismissed' } },
      },
    },

    // ════════════════════════════════════════════════════════════
    // PUBLIC
    // ════════════════════════════════════════════════════════════
    '/public/stocks/{ticker}': {
      get: {
        tags: ['public'],
        summary: 'Public stock preview (cached 15 min)',
        parameters: [{ name: 'ticker', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Stock preview', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { $ref: '#/components/schemas/StockPreview' } } } } } } },
      },
    },
    '/waitlist': {
      post: {
        tags: ['public'],
        summary: 'Join the launch waitlist',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' }, source: { type: 'string' } } } } } },
        responses: { '201': { description: 'Added to waitlist' } },
      },
    },
    '/waitlist/count': {
      get: {
        tags: ['public'],
        summary: 'Get total waitlist count',
        responses: { '200': { description: 'Waitlist count', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { count: { type: 'integer' } } } } } } } } },
      },
    },
    '/sample-portfolios': {
      get: {
        tags: ['public'],
        summary: 'Get themed sample portfolios',
        description: 'Returns 4 themed sample portfolios with 10 stocks each for unauthenticated users.',
        responses: { '200': { description: 'Sample portfolios' } },
      },
    },
  },
};
