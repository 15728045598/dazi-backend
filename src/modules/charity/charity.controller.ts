import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Patch, Query, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CharityService } from './charity.service';

@ApiTags('charity')
@Controller({ path: 'charity', version: '1' })
export class CharityController {
  constructor(private readonly charity: CharityService) {}

  // ===== 公开接口 =====
  
  @Public()
  @Get('fund')
  getPublicFund() {
    return this.charity.getPublicFund();
  }

  @Public()
  @Get('campaigns')
  listCampaigns(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('status') status?: string,
  ) {
    return this.charity.listCampaigns(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
      status,
    );
  }

  // 公益活动（从 Activity 表获取，isCharity=true）
  @Public()
  @Get('activities')
  listCharityActivities(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.charity.listCharityActivities(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
    );
  }

  // 活动记录（Travel 表中关联了公益活动的记录）
  @Public()
  @Get('records')
  listCharityRecords(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.charity.listCharityRecords(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
    );
  }

  // 支出记录
  @Public()
  @Get('expenses')
  listExpenses(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.charity.listExpenses(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
    );
  }

  // 旧版公益项目接口（保留兼容）
  @Public()
  @Get('projects')
  listProjects(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.charity.listCharityProjects(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
    );
  }

  // 公益文章接口
  @Public()
  @Get('articles')
  listArticles(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.charity.listArticles(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 10,
    );
  }

  @Public()
  @Get('articles/:id')
  getArticle(@Param('id') id: string) {
    return this.charity.getArticle(id);
  }

  @ApiBearerAuth()
  @Post('articles')
  createArticle(
    @Req() req: { user: { userId: string; type: string } },
    @Body() body: { title: string; summary?: string; coverImage?: string; content: string },
  ) {
    if (req.user.type !== 'admin') throw new ForbiddenException();
    return this.charity.createArticle(body);
  }

  @ApiBearerAuth()
  @Patch('articles/:id')
  updateArticle(
    @Req() req: { user: { userId: string; type: string } },
    @Param('id') id: string,
    @Body() body: { title?: string; summary?: string; coverImage?: string; content?: string; published?: boolean },
  ) {
    if (req.user.type !== 'admin') throw new ForbiddenException();
    return this.charity.updateArticle(id, body);
  }

  @ApiBearerAuth()
  @Delete('articles/:id')
  deleteArticle(
    @Req() req: { user: { userId: string; type: string } },
    @Param('id') id: string,
  ) {
    if (req.user.type !== 'admin') throw new ForbiddenException();
    return this.charity.deleteArticle(id);
  }

  @Public()
  @Get('donations/public')
  getPublicDonations(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.charity.getPublicDonations(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
    );
  }

  // ===== 需要登录的接口 =====
  
  @ApiBearerAuth()
  @Get('donations')
  getMyDonations(
    @Req() req: { user: { userId: string; type: string } },
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.charity.getDonations(
      req.user.userId,
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 20,
    );
  }

  @ApiBearerAuth()
  @Post('donations')
  createDonation(
    @Req() req: { user: { userId: string; type: string } },
    @Body() body: {
      amount: number;
      campaignId?: string;
      type?: 'PLATFORM_REGISTRATION' | 'USER_DONATION' | 'PLATFORM_DONATION';
      note?: string;
    },
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.charity.createDonation({
      userId: req.user.userId,
      amount: body.amount,
      campaignId: body.campaignId,
      type: body.type || 'USER_DONATION',
      note: body.note,
    });
  }

  @ApiBearerAuth()
  @Get('transactions')
  getTransactions(
    @Req() req: { user: { userId: string; type: string } },
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    if (req.user.type === 'admin') throw new ForbiddenException();
    return this.charity.getFundTransactions(
      skip ? parseInt(skip, 10) : 0,
      take ? parseInt(take, 10) : 50,
    );
  }
}