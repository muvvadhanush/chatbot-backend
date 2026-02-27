const { DataTypes } = require('sequelize');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // 1. Enable pgvector extension
        // Note: This requires superuser privileges on some postgres setups.
        // If it fails, the user might need to enable it manually in Supabase dashboard.
        try {
            await queryInterface.sequelize.query('CREATE EXTENSION IF NOT EXISTS vector;');
        } catch (error) {
            console.warn("⚠️ Could not enable pgvector extension. Please enable it manually in your database dashboard if this fails.", error.message);
        }

        // 2. Add embedding column
        await queryInterface.addColumn('ConnectionKnowledges', 'embedding', {
            type: 'vector(1536)', // Use string literal for custom PG type
            allowNull: true
        });

        // 3. Create HNSW Index for fast similarity search
        // Uses cosine distance (<=> operator is not standard SQL, usually handled by index type)
        // "vector_cosine_ops" is the operator class for cosine distance in pgvector
        try {
            await queryInterface.sequelize.query(`
        CREATE INDEX IF NOT EXISTS "ConnectionKnowledges_embedding_idx" 
        ON "ConnectionKnowledges" 
        USING hnsw (embedding vector_cosine_ops);
      `);
        } catch (error) {
            console.warn("⚠️ Could not create HNSW index. You may need to create it manually.", error.message);
        }
    },

    down: async (queryInterface, Sequelize) => {
        // 1. Remove index
        await queryInterface.sequelize.query('DROP INDEX IF EXISTS "ConnectionKnowledges_embedding_idx";');

        // 2. Remove column
        await queryInterface.removeColumn('ConnectionKnowledges', 'embedding');

        // 3. Disable extension (Optional, usually safer to keep)
        // await queryInterface.sequelize.query('DROP EXTENSION IF EXISTS vector;');
    }
};
