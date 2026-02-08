import { Hono } from 'hono';
import { z } from 'zod';
import { validateQuery } from '../middleware/validator.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { searchByName, getExecutiveById } from '../services/executive.service.js';
import { success } from '../utils/response.js';

type Variables = {
  user: AuthUser;
};

const executiveRoutes = new Hono<{ Variables: Variables }>();

// Apply auth middleware to all executive routes
executiveRoutes.use('*', authMiddleware);

// Zod schema for GET /executives/search query params
const searchExecutivesQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.string().optional().default('10'),
});

// GET /executives/search - Search executives by name or title
executiveRoutes.get('/search', validateQuery(searchExecutivesQuerySchema), async (c) => {
  const query = c.req.query();

  const q = query.q!;
  const limit = Math.min(Math.max(parseInt(query.limit || '10', 10) || 10, 1), 50);

  const results = await searchByName(q, limit);

  const executiveDtos = results.map((exec) => ({
    id: exec.id,
    stock_id: exec.stockId,
    name: exec.name,
    title: exec.title,
    years_at_company: exec.yearsAtCompany,
    previous_companies: exec.previousCompanies,
    education: exec.education,
    specialization: exec.specialization,
    social_linkedin: exec.socialLinkedin,
    social_twitter: exec.socialTwitter,
    created_at: exec.createdAt.toISOString(),
    updated_at: exec.updatedAt.toISOString(),
  }));

  return c.json(success(executiveDtos), 200);
});

// GET /executives/:id - Get executive detail with full career history
executiveRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  const exec = await getExecutiveById(id);

  const executiveDto = {
    id: exec.id,
    stock_id: exec.stockId,
    name: exec.name,
    title: exec.title,
    years_at_company: exec.yearsAtCompany,
    previous_companies: exec.previousCompanies,
    education: exec.education,
    specialization: exec.specialization,
    social_linkedin: exec.socialLinkedin,
    social_twitter: exec.socialTwitter,
    created_at: exec.createdAt.toISOString(),
    updated_at: exec.updatedAt.toISOString(),
  };

  return c.json(success(executiveDto), 200);
});

export { executiveRoutes };
