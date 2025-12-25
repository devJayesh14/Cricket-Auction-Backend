const Player = require('../models/Player');
const Team = require('../models/Team'); // Ensure Team model is loaded for populate
const path = require('path');
const cloudStorage = require('../services/cloudStorage.service');

/**
 * Create a new player
 */
async function createPlayer(req, res, next) {
  try {
    // Extract form data
    const {
      name,
      age,
      role,
      basePrice
    } = req.body;

    // Handle file upload - use cloud storage if configured, otherwise use local path
    let photoPath = null;
    if (req.file) {
      try {
        if (cloudStorage.isConfigured()) {
          // Use cloud storage (works for both local and serverless)
          if (req.file.buffer) {
            // Serverless environment (memory storage)
            photoPath = await cloudStorage.uploadImage(
              req.file.buffer,
              'players',
              req.file.originalname
            );
          } else if (req.file.path) {
            // Local environment (disk storage)
            photoPath = await cloudStorage.uploadImageFromPath(
              req.file.path,
              'players'
            );
          }
        } else if (req.file.path) {
          // Fallback to local storage if cloud storage not configured
          photoPath = `uploads/players/${req.file.filename}`;
        } else {
          console.warn('File upload detected but cloud storage not configured and no file path available.');
        }
      } catch (uploadError) {
        console.error('Error uploading photo:', uploadError);
        // Don't fail the request, just log the error and continue without photo
      }
    } else if (req.body.photo) {
      // Fallback: if photo is sent as base64 (for backward compatibility)
      // Store it, but this is not recommended for large files
      photoPath = req.body.photo;
    }

    // Build player data object from form
    const playerData = {
      name: name?.trim(),
      age: Number(age),
      role: role,
      basePrice: Number(basePrice),
      photo: photoPath,
      // Statistics will default to 0 from the model schema
      status: 'available' // Default status
    };
    
    const player = new Player(playerData);
    await player.save();

    res.status(201).json({
      success: true,
      message: 'Player created successfully',
      data: player,
    });
  } catch (error) {
    // Delete uploaded file if there's an error (only if using disk storage)
    if (req.file && req.file.path) {
      const fs = require('fs');
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
    next(error);
  }
}

/**
 * Get all players
 */
async function getPlayers(req, res, next) {
  try {
    const { status, role } = req.query;
    const query = {};
    
    if (status) query.status = status;
    if (role) query.role = role;

    const players = await Player.find(query)
      .populate('teamId', 'name shortName logo')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: players,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get single player by ID
 */
async function getPlayerById(req, res, next) {
  try {
    const { id } = req.params;
    
    const player = await Player.findById(id)
      .populate('teamId', 'name shortName logo');

    if (!player) {
      const error = new Error('Player not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      data: player,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update player
 */
async function updatePlayer(req, res, next) {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Handle file upload if provided - use cloud storage if configured
    if (req.file) {
      try {
        // Get existing player to delete old photo from cloud storage if needed
        const existingPlayer = await Player.findById(id);
        const oldPhotoUrl = existingPlayer?.photo;

        if (cloudStorage.isConfigured()) {
          // Use cloud storage (works for both local and serverless)
          if (req.file.buffer) {
            // Serverless environment (memory storage)
            updateData.photo = await cloudStorage.uploadImage(
              req.file.buffer,
              'players',
              req.file.originalname
            );
          } else if (req.file.path) {
            // Local environment (disk storage)
            updateData.photo = await cloudStorage.uploadImageFromPath(
              req.file.path,
              'players'
            );
          }

          // Delete old photo from cloud storage if it was a cloud URL
          if (oldPhotoUrl && oldPhotoUrl.includes('cloudinary.com')) {
            await cloudStorage.deleteImage(oldPhotoUrl).catch(err => {
              console.error('Error deleting old photo from cloud storage:', err);
              // Don't fail if deletion fails
            });
          }
        } else if (req.file.path) {
          // Fallback to local storage if cloud storage not configured
          let photoPath = req.file.path.replace(/\\/g, '/');
          const pathParts = photoPath.split('/');
          const uploadsIndex = pathParts.indexOf('uploads');
          if (uploadsIndex !== -1) {
            photoPath = pathParts.slice(uploadsIndex).join('/');
          }
          updateData.photo = photoPath;
        } else {
          console.warn('File upload detected but cloud storage not configured and no file path available.');
        }
      } catch (uploadError) {
        console.error('Error uploading photo:', uploadError);
        // Don't fail the request, just log the error
      }
    }

    // Parse statistics if provided as JSON string
    if (updateData.statistics && typeof updateData.statistics === 'string') {
      try {
        updateData.statistics = JSON.parse(updateData.statistics);
      } catch (e) {
        // If parsing fails, ignore statistics
        delete updateData.statistics;
      }
    }

    // Convert string numbers to numbers
    if (updateData.age) updateData.age = Number(updateData.age);
    if (updateData.basePrice) updateData.basePrice = Number(updateData.basePrice);


    const player = await Player.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('teamId', 'name shortName logo');

    if (!player) {
      const error = new Error('Player not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Player updated successfully',
      data: player,
    });
  } catch (error) {
    // Delete uploaded file if there's an error (only if using disk storage)
    if (req.file && req.file.path) {
      const fs = require('fs');
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
    next(error);
  }
}

/**
 * Delete player
 */
async function deletePlayer(req, res, next) {
  try {
    const { id } = req.params;

    const player = await Player.findByIdAndDelete(id);
    if (!player) {
      const error = new Error('Player not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      message: 'Player deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Bulk import players from CSV file
 */
async function bulkImportPlayers(req, res, next) {
  try {
    if (!req.file) {
      const error = new Error('CSV file is required');
      error.statusCode = 400;
      throw error;
    }

    const fs = require('fs');
    
    // Check if file path exists (won't exist on Vercel/serverless)
    if (!req.file.path) {
      const error = new Error('CSV file upload not supported in serverless environment. Please use a different method.');
      error.statusCode = 400;
      throw error;
    }
    
    // Read CSV file
    const fileContent = fs.readFileSync(req.file.path, 'utf-8');
    
    // Parse CSV manually (simple approach)
    const lines = fileContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      const error = new Error('CSV file must have at least a header and one data row');
      error.statusCode = 400;
      throw error;
    }

    // Get header row
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    // Required columns
    const requiredColumns = ['name', 'age', 'role', 'baseprice'];
    const missingColumns = requiredColumns.filter(col => !headers.includes(col));
    if (missingColumns.length > 0) {
      const error = new Error(`Missing required columns: ${missingColumns.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Process each data row
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      
      try {
        // Create object from row
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        // Validate required fields
        const name = row.name || row['player name'] || row.player_name;
        const age = row.age;
        const role = row.role || row['player role'] || row.player_role;
        const basePrice = row.baseprice || row.base_price || row['base price'];

        if (!name || !age || !role || !basePrice) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Missing required fields`);
          continue;
        }

        // Create player data
        const playerData = {
          name: name.trim(),
          age: parseInt(age),
          role: role.toLowerCase().trim(),
          basePrice: parseFloat(basePrice),
          status: 'available'
        };

        // Validate role
        const validRoles = ['batsman', 'bowler', 'all-rounder', 'wicket-keeper', 'wicket-keeper-batsman'];
        if (!validRoles.includes(playerData.role)) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Invalid role "${playerData.role}"`);
          continue;
        }

        // Validate age
        if (isNaN(playerData.age) || playerData.age < 16 || playerData.age > 50) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Age must be a number between 16 and 50`);
          continue;
        }


        // Validate base price
        if (isNaN(playerData.basePrice) || playerData.basePrice < 0) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Base price must be a valid number >= 0`);
          continue;
        }

        // Check if player already exists (by name)
        const existingPlayer = await Player.findOne({ name: playerData.name });
        if (existingPlayer) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: Player "${playerData.name}" already exists`);
          continue;
        }

        // Create player
        const player = new Player(playerData);
        await player.save();
        results.success++;

      } catch (error) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    // Delete uploaded CSV file (only if using disk storage)
    if (req.file && req.file.path) {
      fs.unlinkSync(req.file.path);
    }

    res.status(200).json({
      success: true,
      message: `Import completed: ${results.success} successful, ${results.failed} failed`,
      data: {
        total: lines.length - 1, // Exclude header
        success: results.success,
        failed: results.failed,
        errors: results.errors
      }
    });

  } catch (error) {
    // Delete uploaded file if there's an error (only if using disk storage)
    if (req.file && req.file.path) {
      const fs = require('fs');
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
    next(error);
  }
}

module.exports = {
  createPlayer,
  getPlayers,
  getPlayerById,
  updatePlayer,
  deletePlayer,
  bulkImportPlayers,
};

