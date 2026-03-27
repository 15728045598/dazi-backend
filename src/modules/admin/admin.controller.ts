import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ActivityCategory,
  ActivityStatus,
  ContentStatus,
  CouponStatus,
  CouponType,
  Difficulty,
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
  ) {
    return this.admin.listActivities(skip ? parseInt(skip, 10) : 0, take ? parseInt(take, 10) : 20, {
      keyword,
      category,
      status,
    });
  }

  @Post('activities')
  createActivity(
    @Body()
    body: {
      leaderId: string;
      title: string;
      summary?: string; // 活动简介
      description: string;
      coverImage: string;
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
  ) {
    return this.admin.listOrders(skip ? parseInt(skip, 10) : 0, take ? parseInt(take, 10) : 20, {
      keyword,
      status,
    });
  }

  @Get('orders/:id')
  order(@Param('id') id: string) {
    return this.admin.getOrder(id);
  }

  @Patch('orders/:id/status')
  orderStatus(@Param('id') id: string, @Body() body: { status: OrderStatus }) {
    return this.admin.updateOrderStatus(id, body.status);
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

  @Get('charity/summary')
  charitySummary() {
    return this.admin.charitySummary();
  }

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

  @Get('charity/donations')
  charityDonations(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.admin.listCharityDonations(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
    );
  }

  @Get('charity/expenses')
  charityExpenses(@Query('skip') skip?: string, @Query('take') take?: string) {
    return this.admin.listCharityExpenses(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
    );
  }

  @Post('charity/expenses')
  createCharityExpense(
    @Body()
    body: {
      projectId: string;
      amount: number;
      purpose: string;
      beneficiary: string;
      proofImages?: string[];
    },
  ) {
    return this.admin.createCharityExpense(body);
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
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.admin.uploadImage(file);
  }
}
