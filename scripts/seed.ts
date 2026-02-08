import { runAllSeeds } from '../src/db/seed/index.js';

/**
 * Entry point for database seeding.
 * Run via: npm run db:seed
 */
runAllSeeds()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
