import { DataSource } from 'typeorm';
import { Rank } from './rank.entity';

export async function seedRanks(ds: DataSource) {
  const repo = ds.getRepository(Rank);
  const rows = [
    { rankKey: 'NOVICE', title: 'Novice', minPoints: 0, sortOrder: 1, icon: 'seedling' },
    { rankKey: 'HELPER', title: 'Helper', minPoints: 50, sortOrder: 2, icon: 'hand-heart' },
    { rankKey: 'PROTECTOR', title: 'Protector', minPoints: 150, sortOrder: 3, icon: 'shield' },
    {
      rankKey: 'GUARDIAN_ANGEL',
      title: 'Guardian Angel',
      minPoints: 400,
      sortOrder: 4,
      icon: 'wings',
    },
  ];
  for (const r of rows) {
    await repo.upsert(r, ['rankKey']);
  }
}
