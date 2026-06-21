import express from 'express';
import { getDailyIssueReport, exportDailyIssueReport, generateStockCardReport, previewStockCard, getDailyReceiveSummary, getDailyRequestSummary, getDailyRRPSummary, getDailyRequestDetails, getDailyReceiveDetails, getDailyRRPDetails, getDashboardTotals, getReceiveRRPReport, exportReceiveRRPReport, getCurrentStockReport, exportCurrentStockReport, getStockHistory, exportStockHistory, getRRPDetailsForNAC, getIssueDetailsForNAC, getReceiveDetailsForNAC, fixRemainingBalances, fixIssueCostsAndBalances } from '../controllers/reportController';
import { generateRequestReceiveReport, exportRequestReceiveReport, generateTenderReceiveReport, generateBorrowHistoryReport } from '../controllers/reportController';
import { getAssetsReport, exportAssetsReport } from '../controllers/assetsReportController';
import { getInsuranceReport, exportInsuranceReport } from '../controllers/insuranceReportController';
import verifyJWT from '../middlewares/verifyJWT';
import { checkPermissions, checkAnyPermissions } from '../middlewares/auth';

const requireDailyIssueReport = checkPermissions(['can_generate_daily_issue_reports']);
const requireDailyIssueReportOrDashboard = checkAnyPermissions([
    'can_generate_daily_issue_reports',
    'can_view_dashboard',
]);
const requireStockCard = checkPermissions(['can_generate_stock_card']);
const requireCurrentStock = checkPermissions(['can_generate_current_stock_report']);
const requireRequestReceiveReport = checkPermissions(['can_access_request/receive_details']);
const requireBorrowHistory = checkPermissions(['can_borrow_stocks']);
const requireDailyReportsOrDashboard = checkAnyPermissions(['view_daily_reports', 'can_view_dashboard']);
const requireReceiveRrpReport = checkPermissions(['can_access_rrp_reports']);
const requireAssetsReport = checkAnyPermissions(['can_access_assets_report', 'can_access_report']);
const requireInsuranceReport = checkAnyPermissions(['can_access_insurance_report', 'can_access_report']);
const requireDashboardTotals = checkPermissions(['can_view_dashboard']);

const router = express.Router();
router.get('/dailyissue', verifyJWT, requireDailyIssueReportOrDashboard, getDailyIssueReport);
router.post('/dailyissue/export', verifyJWT, requireDailyIssueReport, exportDailyIssueReport);
router.post('/stockcard', verifyJWT, requireStockCard, generateStockCardReport);
router.post('/stockcard/preview', verifyJWT, requireStockCard, previewStockCard);
router.get('/current-stock', verifyJWT, requireCurrentStock, getCurrentStockReport);
router.post('/current-stock/export', verifyJWT, requireCurrentStock, exportCurrentStockReport);
router.get('/request-receive', verifyJWT, requireRequestReceiveReport, generateRequestReceiveReport);
router.post('/request-receive/export', verifyJWT, requireRequestReceiveReport, exportRequestReceiveReport);
router.get('/tender-receive', verifyJWT, requireRequestReceiveReport, generateTenderReceiveReport);
router.get('/borrow-history', verifyJWT, requireBorrowHistory, generateBorrowHistoryReport);
router.get('/daily/receive', verifyJWT, requireDailyReportsOrDashboard, getDailyReceiveSummary);
router.get('/daily/request', verifyJWT, requireDailyReportsOrDashboard, getDailyRequestSummary);
router.get('/daily/rrp', verifyJWT, requireDailyReportsOrDashboard, getDailyRRPSummary);
router.get('/dashboard/totals', verifyJWT, requireDashboardTotals, getDashboardTotals);
router.get('/daily/request/details', verifyJWT, requireDailyReportsOrDashboard, getDailyRequestDetails);
router.get('/daily/receive/details', verifyJWT, requireDailyReportsOrDashboard, getDailyReceiveDetails);
router.get('/daily/rrp/details', verifyJWT, requireDailyReportsOrDashboard, getDailyRRPDetails);
router.get('/receive-rrp', verifyJWT, requireReceiveRrpReport, getReceiveRRPReport);
router.post('/receive-rrp/export', verifyJWT, requireReceiveRrpReport, exportReceiveRRPReport);
router.get('/assets', verifyJWT, requireAssetsReport, getAssetsReport);
router.post('/assets/export', verifyJWT, requireAssetsReport, exportAssetsReport);
router.get('/insurance', verifyJWT, requireInsuranceReport, getInsuranceReport);
router.post('/insurance/export', verifyJWT, requireInsuranceReport, exportInsuranceReport);
router.get('/stock-history', verifyJWT, checkPermissions(['can_see_stock_history']), getStockHistory);
router.post('/stock-history/export', verifyJWT, checkPermissions(['can_see_stock_history']), exportStockHistory);
router.get('/rrp-details', verifyJWT, checkPermissions(['can_see_stock_history']), getRRPDetailsForNAC);
router.get('/issue-details', verifyJWT, checkPermissions(['can_see_stock_history']), getIssueDetailsForNAC);
router.get('/receive-details', verifyJWT, checkPermissions(['can_see_stock_history']), getReceiveDetailsForNAC);
router.post('/fix-remaining-balances', verifyJWT, fixRemainingBalances);
router.post('/fix-issue-costs', verifyJWT, fixIssueCostsAndBalances);
export default router;
