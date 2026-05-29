import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';

const TierInfo = db.TierInfo;

export const upsertTierInfo = async (req, res) => {
  try {
    const { shopName, silver, gold, platinum } = req.body;
    
    const [tierInfo, created] = await TierInfo.upsert({
      shopName,
      silver,
      gold,
      platinum
    });

    const message = created ? 'Tier info created successfully' : 'Tier info updated successfully';
    return successResponse(res, tierInfo, message);
  } catch (error) {
    return errorResponse(res, error, 'Failed to save tier info');
  }
};

export const getTierInfo = async (req, res) => {
  try {
    const { shopName } = req.params;
    const tierInfo = await TierInfo.findOne({ where: { shopName } });
    
    if (!tierInfo) {
      return errorResponse(res, 'Tier info not found', 'Not Found', 404);
    }
    
    return successResponse(res, tierInfo, 'Tier info retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to retrieve tier info');
  }
};

export const getAllTierInfo = async (req, res) => {
  try {
    const allTierInfo = await TierInfo.findAll();
    return successResponse(res, allTierInfo, 'All tier info retrieved successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to retrieve all tier info');
  }
};
