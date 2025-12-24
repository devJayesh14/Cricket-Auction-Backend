const Player = require('../models/Player');
const Team = require('../models/Team'); // Ensure Team model is loaded for populate
const path = require('path');

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

    // Handle file upload - photo path from multer
    let photoPath = null;
    if (req.file) {
      // On Vercel (memory storage), file is in buffer, not on disk
      // For now, we'll need to upload to cloud storage (Vercel Blob, S3, etc.)
      // TODO: Implement cloud storage upload for Vercel
      if (process.env.VERCEL && req.file.buffer) {
        // Memory storage - would need to upload to cloud storage
        // For now, skip file storage on Vercel or use a placeholder
        console.warn('File upload on Vercel requires cloud storage integration');
        photoPath = null; // Will need cloud storage URL instead
      } else {
        // Disk storage - normal path
        photoPath = `uploads/players/${req.file.filename}`;
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
    // Delete uploaded file if there's an error
    if (req.file) {
      const fs = require('fs');
      const filePath = req.file.path;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
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

    // Handle file upload if provided
    if (req.file) {
      updateData.photo = req.file.path;
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
    // Delete uploaded file if there's an error
    if (req.file) {
      const fs = require('fs');
      const filePath = req.file.path;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
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

    // Delete uploaded CSV file
    fs.unlinkSync(req.file.path);

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
    // Delete uploaded file if there's an error
    if (req.file) {
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

