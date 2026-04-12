import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ActivityCategory,
  ActivityStatus,
  ContentStatus,
  CouponStatus,
  CouponType,
  Difficulty,
  FeedbackStatus,
  FeedbackType,
  HelpStatus,
  LeaderStatus,
  MessageType,
  OrderStatus,
  PointsType,
  ProjectStatus,
  UserRole,
  UserStatus,
  WishStatus,
} from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  dashboard(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.admin.dashboard(startDate, endDate);
  }

  @Get('settings')
  settings() {
    return this.admin.getSystemSettings();
  }

  @Post('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.admin.updateSystemSettings(body);
  }

  @Get('users')
  users(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('status') status?: UserStatus,
    @Query('role') role?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.admin.listUsers({
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 20,
      status,
      role,
      keyword,
    });
  }

  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Patch('users/:id/status')
  userStatus(@Param('id') id: string, @Body() body: { status: UserStatus }) {
    return this.admin.updateUserStatus(id, body.status);
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @Body() body: { role: UserRole }) {
    return this.admin.updateUserRole(id, body.role);
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateUser(id, body);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string) {
    return this.admin.deleteUser(id);
  }

  @Get('activities')
  activities(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('keyword') keyword?: string,
    @Query('category') category?: ActivityCategory,
    @Query('status') status?: ActivityStatus,
    @Query('isCharity') isCharity?: string,
  ) {
    return this.admin.listActivities(skip ? parseInt(skip, 10) : 0, take ? parseInt(take, 10) : 20, {
      keyword,
      category,
      status,
      isCharity: isCharity === 'true' ? true : isCharity === 'false' ? false : undefined,
    });
  }

  @Post('activities')
  createActivity(
    @Body()
    body: {
      leaderId: string;
      leaderIds?: string[];
      title: string;
      summary?: string; // 活动简介
      description: string;
      coverImage: string;
      groupChatQrCode?: string; // 群聊二维码
      category: ActivityCategory;
      difficulty: Difficulty;
      startTime: string;
      endTime: string;
      registerDeadline: string;
      location?: string;
      price: number;
      minParticipants?: number;
      maxParticipants?: number;
      status?: ActivityStatus;
      isCharity?: boolean; // 是否为公益活动
      // 价格相关
      earlyBirdPrice?: number;
      earlyBirdEndTime?: string;
      originalPrice?: number;
      // 费用相关
      costIncludes?: string; // 费用包含
      costExcludes?: string; // 费用不含
      // 其他
      tags?: string[];
      locationPoi?: {
        name: string;
        lat?: number;
        lng?: number;
        address?: string;
      };
      descriptionImages?: string[];
      // 详情页内容
      requirements?: string; // 参与要求
      refundPolicy?: string; // 退款政策
      disclaimer?: string; // 免责声明
    },
  ) {
    return this.admin.createActivity(body);
  }

  // 多领队管理：为某活动设置/更新领队集合
  @Post('activities/:id/leaders')
  setActivityLeaders(@Param('id') id: string, @Body() body: { leaderIds: string[] }) {
    return this.admin.setActivityLeaders(id, body.leaderIds);
  }

  @Get('activities/:id/leaders')
  activityLeaders(@Param('id') id: string) {
    return this.admin.getActivityLeaders(id);
  }

  // Test endpoint to quickly verify route reachability
  @Get('export-test/:id')
  async exportActivityParticipantsTest(@Param('id') id: string, @Res() res: any) {
    res.set({ 'Content-Type': 'text/plain; charset=utf-8' });
    res.send(`OK export-test for ${id}`);
  }

  @Get('export-activity/:id')
  async exportActivityParticipants(@Param('id') id: string) {
    console.log('[Export] Route hit with id:', id);
    const csv = await this.admin.exportActivityParticipants(id);
    return csv;
  }

  @Get('activities/:id/participants')
  activityParticipants(@Param('id') id: string) {
    return this.admin.getActivityParticipants(id);
  }

  @Get('activities/:id')
  activity(@Param('id') id: string) {
    return this.admin.getActivity(id);
  }

  @Patch('activities/:id/status')
  activityStatus(@Param('id') id: string, @Body() body: { status: ActivityStatus }) {
    return this.admin.updateActivityStatus(id, body.status);
  }

  @Patch('activities/:id')
  updateActivity(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateActivity(id, body);
  }

  @Patch('activities/:id/group-chat-qr')
  updateGroupChatQrCode(@Param('id') id: string, @Body() body: { groupChatQrCode: string }) {
    return this.admin.updateActivity(id, { groupChatQrCode: body.groupChatQrCode });
  }

  @Delete('activities/:id')
  deleteActivity(@Param('id') id: string) {
    return this.admin.deleteActivity(id);
  }

  @Post('activities/:id/images')
  uploadActivityImage(@Param('id') id: string, @Body() body: { filename: string }) {
    return this.admin.uploadActivityImage(id, body.filename);
  }

  @Get('orders')
  orders(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: OrderStatus,
    @Query('activityId') activityId?: string,
  ) {
    return this.admin.listOrders(skip ? parseInt(skip, 10) : 0, take ? parseInt(take, 10) : 20, {
      keyword,
      status,
      activityId,
    });
  }

  @Get('orders/:id')
  order(@Param('id') id: string) {
    return this.admin.getOrder(id);
  }

  @Patch('orders/:id/status')
  orderStatus(@Param('id') id: string, @Body() body: { status: OrderStatus; reason?: string }) {
    return this.admin.updateOrderStatus(id, body.status);
  }

  // 直接退款
  @Post('orders/:id/refund')
  adminRefundOrder(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.admin.adminRefundOrder(id, body.reason);
  }

  // 审核通过退款
  @Post('orders/:id/approve-refund')
  approveRefund(@Param('id') id: string) {
    return this.admin.approveRefund(id, 'admin');
  }

  // 拒绝退款
  @Post('orders/:id/reject-refund')
  rejectRefund(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.admin.rejectRefund(id, body.reason);
  }

  // 删除订单
  @Delete('orders/:id')
  deleteOrder(@Param('id') id: string) {
    return this.admin.deleteOrder(id);
  }

  // 取消活动并退款所有参与者
  @Post('activities/:id/cancel-with-refund')
  cancelActivityWithRefund(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.admin.cancelActivityWithRefund(id, body.reason);
  }

  // 核销记录列表
  @Get('verifications')
  verificationRecords(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('activityId') activityId?: string,
    @Query('verified') verified?: string,
  ) {
    return this.admin.listVerificationRecords(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
      {
        activityId,
        verified: verified === 'true' ? true : verified === 'false' ? false : undefined,
      },
    );
  }

  @Get('leaders')
  leaders() {
    return this.admin.listLeaders();
  }

  @Get('leader-applications')
  leaderApplications() {
    return this.admin.listLeaderApplications();
  }

  @Post('leader-applications/:id/approve')
  approveLeader(@Param('id') id: string) {
    return this.admin.approveLeaderApplication(id);
  }

  @Post('leader-applications/:id/reject')
  rejectLeader(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.admin.rejectLeaderApplication(id, body.reason);
  }

  @Patch('leaders/:id')
  updateLeader(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateLeader(id, body);
  }

  @Patch('leaders/:id/status')
  updateLeaderStatus(@Param('id') id: string, @Body() body: { status: LeaderStatus }) {
    return this.admin.updateLeaderStatus(id, body.status);
  }

  @Delete('leaders/:id')
  deleteLeader(@Param('id') id: string) {
    return this.admin.deleteLeader(id);
  }

  @Get('coupons')
  coupons() {
    return this.admin.listCouponsAdmin();
  }

  @Post('coupons')
  createCoupon(
    @Body()
    body: {
      name: string;
      description?: string;
      type: CouponType;
      value: number;
      minAmount?: number;
      maxDiscount?: number;
      validDays: number;
      totalCount?: number;
      userLimit?: number;
      applicableCategories?: ActivityCategory[];
      status?: CouponStatus;
    },
  ) {
    return this.admin.createCoupon(body);
  }

  @Patch('coupons/:id/status')
  couponStatus(@Param('id') id: string, @Body() body: { status: CouponStatus }) {
    return this.admin.updateCouponStatus(id, body.status);
  }

  @Post('coupons/:id/issue-all')
  issueCouponToAll(@Param('id') id: string) {
    return this.admin.issueCouponToAll(id);
  }

  @Post('coupons/:id/issue')
  issueCouponToUsers(@Param('id') id: string, @Body() body: { userIds: string[] }) {
    return this.admin.issueCouponToUsers(id, body.userIds);
  }

  @Delete('coupons/:id')
  deleteCoupon(@Param('id') id: string) {
    return this.admin.deleteCoupon(id);
  }

  @Patch('coupons/:id')
  updateCoupon(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateCoupon(id, body);
  }

  @Get('points/summary')
  pointsSummary() {
    return this.admin.pointsSummary();
  }

  @Get('points/transactions')
  pointsTransactions(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('type') type?: PointsType,
    @Query('keyword') keyword?: string,
  ) {
    return this.admin.listPointsTransactions(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
      { type, keyword },
    );
  }

  @Post('points/adjust')
  adjustPoints(
    @Body()
    body: {
      userId: string;
      amount: number;
      reason: string;
    },
  ) {
    return this.admin.adjustUserPoints(body);
  }

  // 获取单个用户的积分信息
  @Get('points/user/:userId')
  getUserPoints(@Param('userId') userId: string) {
    return this.admin.getUserPoints(userId);
  }

  // 搜索用户积分信息
  @Get('points/search')
  searchUserPoints(@Query('keyword') keyword?: string) {
    return this.admin.searchUserPoints(keyword || '');
  }

  @Get('travels')
  travels(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: ContentStatus,
  ) {
    return this.admin.listTravelsAdmin(skip ? parseInt(skip, 10) : 0, take ? parseInt(take, 10) : 20, {
      keyword,
      status,
    });
  }

  @Get('travels/:id')
  travel(@Param('id') id: string) {
    return this.admin.getTravelAdmin(id);
  }

  @Patch('travels/:id/status')
  travelStatus(@Param('id') id: string, @Body() body: { status: ContentStatus }) {
    return this.admin.updateTravelStatus(id, body.status);
  }

  @Patch('travels/:id/activity')
  updateTravelActivity(@Param('id') id: string, @Body() body: { activityId: string | null }) {
    return this.admin.updateTravelActivity(id, body.activityId);
  }

  @Patch('travels/:id')
  updateTravel(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateTravel(id, body);
  }

  @Delete('travels/:id')
  deleteTravel(@Param('id') id: string) {
    return this.admin.deleteTravel(id);
  }

  @Get('wishes')
  wishes(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: WishStatus,
  ) {
    return this.admin.listWishesAdmin(skip ? parseInt(skip, 10) : 0, take ? parseInt(take, 10) : 20, {
      keyword,
      status,
    });
  }

  @Patch('wishes/:id/status')
  wishStatus(@Param('id') id: string, @Body() body: { status: WishStatus }) {
    return this.admin.updateWishStatus(id, body.status);
  }

  @Get('wishes/:id')
  wish(@Param('id') id: string) {
    return this.admin.getWishAdmin(id);
  }

  @Get('helps')
  helps(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: HelpStatus,
  ) {
    return this.admin.listHelpsAdmin(skip ? parseInt(skip, 10) : 0, take ? parseInt(take, 10) : 20, {
      keyword,
      status,
    });
  }

  @Patch('helps/:id/status')
  helpStatus(@Param('id') id: string, @Body() body: { status: HelpStatus }) {
    return this.admin.updateHelpStatus(id, body.status);
  }

  @Get('helps/:id')
  help(@Param('id') id: string) {
    return this.admin.getHelpAdmin(id);
  }

  // ===== 反馈管理 =====
  @Get('feedbacks')
  feedbacks(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: FeedbackStatus,
    @Query('type') type?: FeedbackType,
  ) {
    return this.admin.listFeedbacks(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
      { keyword, status, type },
    );
  }

  @Get('feedbacks/:id')
  feedback(@Param('id') id: string) {
    return this.admin.getFeedback(id);
  }

  @Post('feedbacks/:id/reply')
  feedbackReply(@Param('id') id: string, @Body() body: { reply: string; repliedBy: string }) {
    return this.admin.replyFeedback(id, body);
  }

  @Patch('feedbacks/:id/status')
  feedbackStatus(@Param('id') id: string, @Body() body: { status: FeedbackStatus }) {
    return this.admin.updateFeedbackStatus(id, body.status);
  }

  @Delete('feedbacks/:id')
  deleteFeedback(@Param('id') id: string) {
    return this.admin.deleteFeedback(id);
  }

  @Get('messages')
  messages(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('keyword') keyword?: string,
    @Query('type') type?: MessageType,
    @Query('isRead') isRead?: string,
  ) {
    return this.admin.listMessagesAdmin(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 30,
      {
        keyword,
        type,
        isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
      },
    );
  }

  @Post('messages')
  createMessage(
    @Body()
    body: {
      title: string;
      content: string;
      type?: MessageType;
      userId?: string;
    },
  ) {
    return this.admin.createMessageAdmin(body);
  }

  // ===== 公益账户汇总 =====
  
  @Get('charity/summary')
  charitySummary() {
    return this.admin.charitySummary();
  }

  // ===== 公益活动管理 =====
  
  @Get('charity/campaigns')
  charityCampaigns(@Query('skip') skip?: string, @Query('take') take?: string, @Query('status') status?: string) {
    return this.admin.listCharityCampaignsAdmin(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
      status,
    );
  }

  @Get('charity/campaigns/:id')
  charityCampaign(@Param('id') id: string) {
    return this.admin.getCharityCampaignAdmin(id);
  }

  @Post('charity/campaigns')
  createCharityCampaign(
    @Body()
    body: {
      title: string;
      description: string;
      coverImage?: string;
      targetAmount: number;
      startDate: string;
      endDate?: string;
    },
  ) {
    return this.admin.createCharityCampaign(body);
  }

  @Patch('charity/campaigns/:id')
  updateCharityCampaign(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateCharityCampaign(id, body);
  }

  @Patch('charity/campaigns/:id/status')
  updateCharityCampaignStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.admin.updateCharityCampaign(id, { status: body.status });
  }

  @Delete('charity/campaigns/:id')
  deleteCharityCampaign(@Param('id') id: string) {
    return this.admin.deleteCharityCampaign(id);
  }

  @Get('charity/donations')
  charityDonations(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.admin.listCharityDonations(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
    );
  }

  @Get('charity/expenses')
  charityExpenses(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('activityId') activityId?: string,
  ) {
    return this.admin.listCharityExpenses(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
      activityId,
    );
  }

  @Post('charity/expenses')
  createCharityExpense(
    @Body()
    body: {
      campaignId?: string;
      activityId?: string;
      amount: number;
      purpose: string;
      beneficiary?: string;
      description?: string;
      proofImages?: string[];
    },
  ) {
    return this.admin.createCharityExpense(body);
  }

  @Patch('charity/expenses/:id')
  updateCharityExpense(
    @Param('id') id: string,
    @Body()
    body: {
      activityId?: string;
      amount?: number;
      purpose?: string;
      beneficiary?: string;
      description?: string;
      proofImages?: string[];
    },
  ) {
    return this.admin.updateCharityExpense(id, body);
  }

  @Delete('charity/expenses/:id')
  deleteCharityExpense(@Param('id') id: string) {
    return this.admin.deleteCharityExpense(id);
  }

  // 公益活动发布事后内容（创建游记）
  @Post('charity/create-travel')
  createTravelFromCharity(
    @Body()
    body: {
      title: string;
      content: string;
      coverImage?: string;
      activityId?: string;
      images?: string[];
    },
  ) {
    return this.admin.createTravelFromCharity(body);
  }

  // ===== 旧版公益项目（保留兼容）=====

  @Get('charity/projects')
  charityProjects() {
    return this.admin.listCharityProjectsAdmin();
  }

  @Post('charity/projects')
  createCharityProject(
    @Body()
    body: {
      name: string;
      description: string;
      coverImage?: string;
      targetAmount: number;
      startTime: string;
      endTime?: string;
      status?: ProjectStatus;
    },
  ) {
    return this.admin.createCharityProject(body);
  }

  // ===== 钱包管理 =====
  @Get('wallet')
  wallets() {
    return this.admin.listWallets();
  }

  @Get('wallet/transactions')
  walletTransactions(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.admin.listWalletTransactions(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
    );
  }

  @Post('wallet/adjust')
  adjustWallet(
    @Body() body: { userId: string; amount: number; type: 'add' | 'subtract'; reason: string },
  ) {
    return this.admin.adjustWallet(body);
  }

  // 提现管理
  @Get('wallet/withdrawals')
  listWithdrawals(
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.admin.listWithdrawals(status, skip ? parseInt(skip, 10) : 0, take ? parseInt(take, 10) : 20);
  }

  @Patch('wallet/withdrawals/:id')
  updateWithdrawal(
    @Param('id') id: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; note?: string },
  ) {
    return this.admin.updateWithdrawal(id, body.status, body.note);
  }

  // ===== 步数管理 =====
  @Get('steps')
  steps(@Query('date') date?: string) {
    return this.admin.listSteps(date);
  }

  @Get('steps/leaderboard')
  stepsLeaderboard(@Query('type') type: 'daily' | 'monthly' | 'total', @Query('limit') limit?: string) {
    return this.admin.getStepsLeaderboard(type, limit ? parseInt(limit) : 10);
  }

  // ===== 邀请管理 =====
  @Get('invite/relations')
  inviteRelations(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.admin.listInviteRelations(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
    );
  }

  @Get('invite/rewards')
  inviteRewards(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.admin.listInviteRewards(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
    );
  }

  @Get('invite/leaderboard')
  inviteLeaderboard(@Query('limit') limit?: string) {
    return this.admin.getInviteLeaderboard(limit ? parseInt(limit) : 10);
  }

  @Post('upload/image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    console.log('[Admin Controller] 收到文件:', file?.originalname, file?.size);
    const result = await this.admin.uploadImage(file);
    console.log('[Admin Controller] 返回:', JSON.stringify(result));
    return result;
  }

  // ===== 核销管理 =====
  // 根据核销码查询订单（扫码时使用）
  @Get('verify/code/:code')
  getOrderByCode(@Param('code') code: string) {
    return this.admin.getOrderByVerificationCode(code);
  }

  // 核销订单
  @Post('verify/:orderId')
  verifyOrder(
    @Param('orderId') orderId: string,
    @Body() body: { verifierId: string },
  ) {
    return this.admin.verifyOrder(orderId, body.verifierId);
  }

  // ===== 合作加入管理 =====
  @Get('partners')
  listPartners(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.admin.listPartnerApplications(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
      { status, keyword },
    );
  }

  @Get('partners/:id')
  getPartner(@Param('id') id: string) {
    return this.admin.getPartnerApplication(id);
  }

  @Patch('partners/:id/status')
  updatePartnerStatus(
    @Param('id') id: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; adminNote?: string },
  ) {
    return this.admin.updatePartnerApplicationStatus(id, body.status, body.adminNote);
  }

  @Delete('partners/:id')
  deletePartner(@Param('id') id: string) {
    return this.admin.deletePartnerApplication(id);
  }

  // ===== 价格类型管理 =====
  @Get('activities/:activityId/price-types')
  getActivityPriceTypes(@Param('activityId') activityId: string) {
    return this.admin.getActivityPriceTypes(activityId);
  }

  @Post('activities/:activityId/price-types')
  createPriceType(
    @Param('activityId') activityId: string,
    @Body()
    body: {
      name: string;
      price: number;
      description?: string;
      stock?: number;
      sort?: number;
    },
  ) {
    return this.admin.createPriceType(activityId, body);
  }

  @Patch('price-types/:id')
  updatePriceType(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      price?: number;
      description?: string;
      stock?: number;
      sort?: number;
    },
  ) {
    return this.admin.updatePriceType(id, body);
  }

  @Delete('price-types/:id')
  deletePriceType(@Param('id') id: string) {
    return this.admin.deletePriceType(id);
  }

  // ===== 推广大使管理 =====
  @Get('promoters')
  listPromoters(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('keyword') keyword?: string,
    @Query('status') status?: string,
  ) {
    return this.admin.listPromoters(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
      { keyword, status },
    );
  }

  @Get('promoters/search-users')
  searchUsers(@Query('keyword') keyword?: string, @Query('take') take?: string) {
    return this.admin.searchUsers(keyword || '', take ? parseInt(take, 10) : 10);
  }

  @Get('promoters/:id')
  getPromoter(@Param('id') id: string) {
    return this.admin.getPromoter(id);
  }

  @Post('promoters')
  createPromoter(@Body() body: { userId: string }) {
    return this.admin.createPromoter(body);
  }

  @Patch('promoters/:id/status')
  updatePromoterStatus(@Param('id') id: string, @Body() body: { status: 'ACTIVE' | 'DISABLED' }) {
    return this.admin.updatePromoterStatus(id, body.status);
  }

  @Delete('promoters/:id')
  deletePromoter(@Param('id') id: string) {
    return this.admin.deletePromoter(id);
  }

  @Get('promoters/:id/rewards')
  getPromoterRewards(
    @Param('id') id: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('status') status?: string,
  ) {
    return this.admin.getPromoterRewards(
      id,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
      status,
    );
  }
}
