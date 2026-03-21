import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFuelTypeToHelpRequests1710000000001 implements MigrationInterface {
  name = 'AddFuelTypeToHelpRequests1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."fuel_type_enum" AS ENUM('REGULAR', 'DIESEL')
    `);

    await queryRunner.query(`
      ALTER TABLE "help_requests"
      ADD COLUMN "fuel_type" "public"."fuel_type_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "help_requests"
      DROP COLUMN "fuel_type"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."fuel_type_enum"
    `);
  }
}
