import express from 'express';
import {
    getFiscalYear, updateFiscalYear,
    getRequestAuthorityDetails, updateRequestAuthorityDetails,
    getRRPAuthorityDetails, updateRRPAuthorityDetails,
    getRRPSuppliers, addRRPSupplier, updateRRPSupplier, deleteRRPSupplier,
    getFuelSettings, updateFuelSettings,
    getInspectionUsers, addInspectionUser, updateInspectionUser, deleteInspectionUser,
    getRequestingAuthorityList,
    getRequestEmailConfig, updateRequestEmailConfig, toggleMailSending, verifySMTP,
    getIssueSections, addIssueSection, updateIssueSection, deleteIssueSection,
    getActiveIssueSections,
} from '../controllers/settingsController';
import verifyJWT from '../middlewares/verifyJWT';
import { checkPermissions, checkAnyPermissions } from '../middlewares/auth';

const router = express.Router();
router.use(verifyJWT);

// General / fiscal year — dashboard read; app settings write
const requireAppSettings = checkAnyPermissions(['can_access_app_settings', 'can_access_settings']);
const requireFiscalYearRead = checkAnyPermissions([
    'can_access_app_settings',
    'can_access_settings',
    'can_view_dashboard',
]);

router.get('/fiscal-year', requireFiscalYearRead, getFiscalYear);
router.put('/fiscal-year', requireAppSettings, updateFiscalYear);

// Request settings (email config also appears on App Settings)
const requireRequestSettings = checkAnyPermissions([
    'can_access_request_settings',
    'can_access_app_settings',
    'can_access_settings',
]);
router.get('/request/authority-details', requireRequestSettings, getRequestAuthorityDetails);
router.put('/request/authority-details', requireRequestSettings, updateRequestAuthorityDetails);
router.get('/request/email-config', requireRequestSettings, getRequestEmailConfig);
router.put('/request/email-config', requireRequestSettings, updateRequestEmailConfig);
router.post('/request/email-toggle', requireRequestSettings, toggleMailSending);
router.get('/request/email-smtp-test', requireRequestSettings, verifySMTP);
router.get('/request/requesting-authorities', requireRequestSettings, getRequestingAuthorityList);

// RRP settings
const requireRrpSettings = checkAnyPermissions(['can_access_rrp_settings', 'can_access_settings']);
router.get('/rrp/authority-details', requireRrpSettings, getRRPAuthorityDetails);
router.put('/rrp/authority-details', requireRrpSettings, updateRRPAuthorityDetails);
router.get('/rrp/suppliers', requireRrpSettings, getRRPSuppliers);
router.post('/rrp/suppliers', requireRrpSettings, addRRPSupplier);
router.put('/rrp/suppliers/:id', requireRrpSettings, updateRRPSupplier);
router.delete('/rrp/suppliers/:id', requireRrpSettings, deleteRRPSupplier);
router.get('/rrp/inspection-users', requireRrpSettings, getInspectionUsers);
router.post('/rrp/inspection-users', requireRrpSettings, addInspectionUser);
router.put('/rrp/inspection-users/:id', requireRrpSettings, updateInspectionUser);
router.delete('/rrp/inspection-users/:id', requireRrpSettings, deleteInspectionUser);

// Fuel settings
const requireFuelSettings = checkAnyPermissions(['can_access_fuel_settings', 'can_access_settings']);
router.get('/fuel', requireFuelSettings, getFuelSettings);
router.put('/fuel', requireFuelSettings, updateFuelSettings);

// Issue sections (active list — used at issuance time, no settings perm required)
router.get('/issue/sections/active', getActiveIssueSections);

// Issue settings CRUD — requires issue settings permission
const requireIssueSettings = checkAnyPermissions(['can_access_issue_settings', 'can_access_settings']);
router.get('/issue/sections', requireIssueSettings, getIssueSections);
router.post('/issue/sections', requireIssueSettings, addIssueSection);
router.put('/issue/sections/:id', requireIssueSettings, updateIssueSection);
router.delete('/issue/sections/:id', requireIssueSettings, deleteIssueSection);

export default router;
