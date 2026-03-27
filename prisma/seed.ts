import {
  PrismaClient,
  UserRole,
  ActivityCategory,
  Difficulty,
  ActivityStatus,
  LeaderLevel,
  LeaderStatus,
  CouponType,
  CouponStatus,
  ProjectStatus,
  ContentStatus,
  WishType,
  ExpectTime,
  ExpectPeople,
  WishStatus,
  HelpStatus,
  MessageType,
} from '@prisma/client';

const prisma = new PrismaClient();

/** 小程序联调固定账号（与 POST /auth/dev-app-login 对应） */
async function ensureDevAppUser() {
  const u = await prisma.user.upsert({
    where: { openid: 'wx_dev_app' },
    update: {},
    create: {
      openid: 'wx_dev_app',
      nickname: 'App测试(联调)',
      role: UserRole.USER,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=devapp',
      points: 5000,
    },
  });
  await prisma.pointsAccount.upsert({
    where: { userId: u.id },
    update: {},
    create: { userId: u.id },
  });
}

async function main() {
  await ensureDevAppUser();

  const done = await prisma.activity.findFirst({
    where: { title: '西湖群山毅行 · 十里琅珰' },
  });
  if (done) {
    console.log('Seed already applied, skip.');
    return;
  }

  const admin = await prisma.user.upsert({
    where: { openid: 'sys_admin_openid' },
    update: {},
    create: {
      openid: 'sys_admin_openid',
      nickname: '系统管理员',
      role: UserRole.ADMIN,
    },
  });
  await prisma.pointsAccount.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id },
  });

  const leaderUser = await prisma.user.upsert({
    where: { openid: 'leader_demo_1' },
    update: {},
    create: {
      openid: 'leader_demo_1',
      nickname: '金牌领队阿伟',
      role: UserRole.LEADER,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=leader1',
    },
  });
  await prisma.pointsAccount.upsert({
    where: { userId: leaderUser.id },
    update: {},
    create: { userId: leaderUser.id },
  });

  const leader = await prisma.leader.upsert({
    where: { userId: leaderUser.id },
    update: {},
    create: {
      userId: leaderUser.id,
      level: LeaderLevel.MIDDLE,
      status: LeaderStatus.ACTIVE,
      specialties: ['徒步', '露营', '摄影'],
      verifiedAt: new Date(),
    },
  });

  const member = await prisma.user.upsert({
    where: { openid: 'wx_member_demo' },
    update: {},
    create: {
      openid: 'wx_member_demo',
      nickname: '户外小白',
      role: UserRole.USER,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=member',
    },
  });
  await prisma.pointsAccount.upsert({
    where: { userId: member.id },
    update: {},
    create: { userId: member.id },
  });

  await prisma.userProfile.upsert({
    where: { userId: member.id },
    update: {},
    create: {
      userId: member.id,
      city: '杭州',
      bio: '喜欢周末轻徒步',
    },
  });

  const start = new Date();
  start.setDate(start.getDate() + 3);
  const end = new Date(start);
  end.setHours(start.getHours() + 8);
  const deadline = new Date(start);
  deadline.setDate(deadline.getDate() - 1);

  const activity = await prisma.activity.create({
    data: {
      title: '西湖群山毅行 · 十里琅珰',
      description: '经典杭州户外线路，适合新手，领队全程陪同。',
      coverImage: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
      category: ActivityCategory.HIKING,
      difficulty: Difficulty.EASY,
      startTime: start,
      endTime: end,
      registerDeadline: deadline,
      location: '浙江杭州 · 龙井村',
      locationLat: 30.22,
      locationLng: 120.12,
      price: 128,
      originalPrice: 168,
      minParticipants: 4,
      maxParticipants: 20,
      currentCount: 6,
      leaderId: leader.id,
      status: ActivityStatus.PUBLISHED,
      charityAmount: 2,
      images: {
        create: [{ url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800', sort: 0 }],
      },
      schedules: {
        create: [
          { day: 1, time: '08:00', title: '集合出发', description: '龙井村牌坊集合' },
          { day: 1, time: '12:00', title: '山顶路餐', description: '自带干粮' },
        ],
      },
      requirements: {
        create: [
          { type: 'equipment', content: '防滑运动鞋、登山杖、1L 水' },
          { type: 'notice', content: '小雨照常，大雨取消' },
        ],
      },
    },
  });

  await prisma.coupon.createMany({
    data: [
      {
        name: '新用户立减20元',
        description: '满100可用',
        type: CouponType.NEW_USER,
        value: 20,
        minAmount: 100,
        validDays: 30,
        totalCount: 1000,
        status: CouponStatus.ACTIVE,
        applicableCategories: [ActivityCategory.HIKING, ActivityCategory.MOUNTAIN],
      },
      {
        name: '满200减50',
        type: CouponType.FULL_REDUCTION,
        value: 50,
        minAmount: 200,
        validDays: 14,
        status: CouponStatus.ACTIVE,
        applicableCategories: [],
      },
    ],
  });

  const project = await prisma.charityProject.create({
    data: {
      name: '山区儿童运动包计划',
      description: '为偏远山区儿童捐赠运动装备与户外安全教育。',
      coverImage: 'https://images.unsplash.com/photo-1488521787991-7bbf851a6f55?w=800',
      targetAmount: 100000,
      raisedAmount: 23800,
      status: ProjectStatus.ACTIVE,
      startTime: new Date(),
      endTime: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
    },
  });

  await prisma.travel.create({
    data: {
      userId: member.id,
      activityId: activity.id,
      title: '第一次十里琅珰，风景太治愈了',
      content: '全程大约 8 公里，爬升不多，新手友好。感谢领队照顾！',
      coverImage: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800',
      status: ContentStatus.APPROVED,
      viewCount: 120,
      likeCount: 18,
      commentCount: 3,
    },
  });

  await prisma.wish.create({
    data: {
      userId: member.id,
      type: WishType.ACTIVITY,
      title: '想找周末一起骑行的搭子',
      description: '坐标滨江，匀速 20 左右，周末西湖环湖。',
      images: [],
      expectTime: ExpectTime.THIS_WEEK,
      expectPeople: ExpectPeople.SMALL,
      tags: ['骑行', '滨江'],
      status: WishStatus.COLLECTING,
    },
  });

  await prisma.help.create({
    data: {
      userId: member.id,
      type: 'CARPOOL',
      title: '周末安吉滑雪拼车',
      description: '周六早出发，还有两个车位，油费 AA。',
      images: [],
      urgency: 'THIS_WEEK',
      location: '杭州余杭',
      status: HelpStatus.ACTIVE,
    },
  });

  await prisma.message.create({
    data: {
      userId: member.id,
      type: MessageType.SYSTEM,
      title: '欢迎使用搭子',
      content: '发现附近活动，报名即可成行，祝你玩得开心！',
    },
  });

  await prisma.banner.createMany({
    data: [
      {
        title: '春季徒步季',
        image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200',
        linkType: 'PAGE',
        position: 'HOME',
        sort: 0,
      },
      {
        title: '公益同行',
        image: 'https://images.unsplash.com/photo-1488521787991-7bbf851a6f55?w=1200',
        link: `/charity/projects/${project.id}`,
        linkType: 'URL',
        position: 'HOME',
        sort: 1,
      },
    ],
  });

  console.log('Seed OK, activity:', activity.id, 'project:', project.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
