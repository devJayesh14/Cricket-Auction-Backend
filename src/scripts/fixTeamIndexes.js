/**
 * Script to fix Team collection indexes
 * This will drop the existing ownerId index (if it's not sparse) and recreate it as sparse
 * 
 * Run with: node src/scripts/fixTeamIndexes.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { MONGODB_URI } = require('../config/environment');

async function fixTeamIndexes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('teams');

    // Get all indexes
    console.log('\nCurrent indexes on teams collection:');
    const indexes = await collection.indexes();
    indexes.forEach(index => {
      console.log(JSON.stringify(index, null, 2));
    });

    // Check if ownerId index exists and if it's sparse
    const ownerIdIndex = indexes.find(idx => 
      idx.key && idx.key.ownerId !== undefined
    );

    if (ownerIdIndex) {
      console.log('\nFound ownerId index:', ownerIdIndex.name);
      
      // Check if it's sparse
      if (!ownerIdIndex.sparse) {
        console.log('Index is NOT sparse. Dropping it...');
        try {
          await collection.dropIndex(ownerIdIndex.name);
          console.log('✓ Old index dropped successfully');
        } catch (err) {
          if (err.codeName === 'IndexNotFound') {
            console.log('Index not found (might have been dropped already)');
          } else {
            throw err;
          }
        }
      } else {
        console.log('Index is already sparse. No changes needed.');
      }
    } else {
      console.log('\nNo ownerId index found. Creating sparse index...');
    }

    // Create sparse index (Mongoose should do this automatically, but we'll do it explicitly)
    console.log('\nCreating sparse index on ownerId...');
    await collection.createIndex({ ownerId: 1 }, { sparse: true });
    console.log('✓ Sparse index created successfully');

    // Verify the new index
    console.log('\nVerifying indexes after changes:');
    const newIndexes = await collection.indexes();
    const newOwnerIdIndex = newIndexes.find(idx => 
      idx.key && idx.key.ownerId !== undefined
    );
    if (newOwnerIdIndex) {
      console.log('New ownerId index:', JSON.stringify(newOwnerIdIndex, null, 2));
      if (newOwnerIdIndex.sparse) {
        console.log('✓ Index is now sparse - multiple teams can have null ownerId');
      }
    }

    console.log('\n✓ Index fix completed successfully!');
    console.log('You can now create multiple teams with ownerId = null');

  } catch (error) {
    console.error('Error fixing indexes:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

// Run the script
fixTeamIndexes()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });

