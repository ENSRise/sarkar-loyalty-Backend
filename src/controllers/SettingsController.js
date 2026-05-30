import db from '../models';
import { successResponse, errorResponse } from '../helpers/response.helper';

const Setting = db.Setting;

const ALLOWED_KEYS = [
  'shopName',
  'accessToken',
  'silverReferralPoint',
  'goldReferralPoint',
  'platinumReferralPoint',
  'resetCycle',
  'orderCreditDate',
];

export const getSettings = async (req, res) => {
  try {
    const rows = await Setting.findAll({ where: { key: ALLOWED_KEYS } });
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    // mask access token in response — send only whether it's set
    if (settings.accessToken) {
      settings.accessTokenSet = true;
      settings.accessToken = '••••••••••••••••';
    } else {
      settings.accessTokenSet = false;
    }
    return successResponse(res, settings, 'Settings retrieved');
  } catch (error) {
    return errorResponse(res, error, 'Failed to retrieve settings');
  }
};

export const updateSettings = async (req, res) => {
  try {
    const updates = req.body; // { key: value, ... }
    const results = {};

    for (const key of ALLOWED_KEYS) {
      if (key in updates) {
        const val = String(updates[key] ?? '').trim();
        // skip blank accessToken (means "don't change")
        if (key === 'accessToken' && val === '') continue;
        const [row] = await Setting.upsert({ key, value: val });
        results[key] = row.value;
      }
    }

    return successResponse(res, results, 'Settings updated successfully');
  } catch (error) {
    return errorResponse(res, error, 'Failed to update settings');
  }
};
