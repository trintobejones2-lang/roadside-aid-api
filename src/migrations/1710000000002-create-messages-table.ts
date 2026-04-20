import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMessagesTable1710000000002 implements MigrationInterface {
  name = 'CreateMessagesTable1710000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "requestId" uuid NOT NULL,
        "senderUserId" uuid NOT NULL,
        "body" text NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_messages_requestId"
      ON "messages" ("requestId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_messages_senderUserId"
      ON "messages" ("senderUserId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_messages_senderUserId"`);
    await queryRunner.query(`DROP INDEX "IDX_messages_requestId"`);
    await queryRunner.query(`DROP TABLE "messages"`);
  }
}
