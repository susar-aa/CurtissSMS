import { IMigration } from '../migrator';

export const migration008: IMigration = {
  version: 8,
  name: 'quick_create_lookup_indexes_and_defaults',
  up: (db) => {
    // 1. Ensure updated_at column exists on houses, occupations, streets, cities, transportation_methods
    const tables = ['houses', 'occupations', 'streets', 'cities', 'transportation_methods'];
    for (const tableName of tables) {
      const cols = db.prepare(`PRAGMA table_info('${tableName}')`).all() as Array<{ name: string }>;
      const colNames = cols.map(c => c.name);
      if (!colNames.includes('updated_at')) {
        db.exec(`ALTER TABLE "${tableName}" ADD COLUMN updated_at DATETIME;`);
      }
    }

    // 2. Ensure case-insensitive index on trimmed names for lookup tables
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_houses_name ON houses(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_occupations_name ON occupations(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_streets_name ON streets(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_cities_name ON cities(name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_transport_name ON transportation_methods(name COLLATE NOCASE);
    `);

    // 3. Seed initial default houses if none exist
    const houseCount = db.prepare('SELECT COUNT(*) as count FROM houses').get() as { count: number };
    if (houseCount.count === 0) {
      const insertHouse = db.prepare('INSERT OR IGNORE INTO houses (name, color_hex, is_active) VALUES (?, ?, 1)');
      insertHouse.run('Ruby', '#EF4444');
      insertHouse.run('Sapphire', '#3B82F6');
      insertHouse.run('Emerald', '#10B981');
      insertHouse.run('Topaz', '#F59E0B');
    }

    // 4. Seed initial transportation methods if none exist
    const transportCount = db.prepare('SELECT COUNT(*) as count FROM transportation_methods').get() as { count: number };
    if (transportCount.count === 0) {
      const insertTransport = db.prepare('INSERT OR IGNORE INTO transportation_methods (name, is_active) VALUES (?, ?)');
      insertTransport.run('School Van', 1);
      insertTransport.run('Public Bus', 1);
      insertTransport.run('Private Vehicle', 1);
      insertTransport.run('Walking', 1);
      insertTransport.run('Bicycle', 1);
    }
  }
};
