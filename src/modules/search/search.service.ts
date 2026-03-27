import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  // Tencent Map API Key - from environment variable
  private readonly TENCENT_MAP_KEY = process.env.TENCENT_MAP_KEY || '3NXBZ-N2JRA-3INK6-CU2II-WJC4S-EGF6K';

  async searchPlaces(keyword: string, region: string = '中国') {
    if (!keyword?.trim()) {
      return [];
    }

    try {
      // Use Tencent Map WebService API
      const response = await axios.get('https://apis.map.qq.com/ws/place/v1/search', {
        params: {
          keyword: keyword.trim(),
          boundary: `region(${region},0)`,
          page_size: 10,
          key: this.TENCENT_MAP_KEY,
        },
        timeout: 5000,
      });

      console.log('Tencent Map API response:', response.data);

      if (response.data.status === 0 && response.data.data && response.data.data.length > 0) {
        return response.data.data.map((item: any) => ({
          id: item.id,
          title: item.title,
          address: item.address,
          location: {
            lat: item.location.lat,
            lng: item.location.lng,
          },
          category: item.category,
        }));
      }

      console.error('Tencent Map API error:', response.data);
      // If API fails, return mock data for demo
      return this.getMockPlaces(keyword);
    } catch (error) {
      console.error('Failed to search places:', error);
      // Return mock data for demo
      return this.getMockPlaces(keyword);
    }
  }

  // Mock data for demo when API is not available
  private getMockPlaces(keyword: string) {
    const mockPlaces = [
      {
        id: '1',
        title: `${keyword}`,
        address: `中国${keyword}附近`,
        location: { lat: 39.9042 + (Math.random() - 0.5) * 0.1, lng: 116.4074 + (Math.random() - 0.5) * 0.1 },
        category: '景点',
      },
      {
        id: '2',
        title: `${keyword}广场`,
        address: `中国${keyword}广场`,
        location: { lat: 39.9042 + (Math.random() - 0.5) * 0.1, lng: 116.4074 + (Math.random() - 0.5) * 0.1 },
        category: '公共场所',
      },
    ];
    return mockPlaces;
  }

  async search(
    q?: string,
    type?: 'activities' | 'travels' | 'all',
    take: number = 20,
  ) {
    const keyword = q?.trim() || '';
    const results: {
      activities?: unknown[];
      travels?: unknown[];
      total?: number;
    } = {};

    if (!type || type === 'all' || type === 'activities') {
      const activities = await this.prisma.activity.findMany({
        where: keyword
          ? {
              OR: [
                { title: { contains: keyword } },
                { description: { contains: keyword } },
                { location: { contains: keyword } },
              ],
              status: 'PUBLISHED',
            }
          : { status: 'PUBLISHED' },
        include: {
          leader: {
            include: {
              user: {
                select: { nickname: true, avatar: true },
              },
            },
          },
          images: { take: 1, orderBy: { sort: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      });
      results.activities = activities.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        coverImage: a.images[0]?.url || a.coverImage,
        location: a.location,
        startTime: a.startTime,
        price: Number(a.price),
        status: a.status,
        category: a.category,
        currentCount: a.currentCount,
        maxParticipants: a.maxParticipants,
        organizer: a.leader?.user?.nickname || '领队',
      }));
    }

    if (!type || type === 'all' || type === 'travels') {
      const travels = await this.prisma.travel.findMany({
        where: keyword
          ? {
              OR: [
                { title: { contains: keyword } },
                { content: { contains: keyword } },
              ],
              status: 'APPROVED',
            }
          : { status: 'APPROVED' },
        include: {
          user: {
            select: { nickname: true, avatar: true },
          },
          images: { take: 3, orderBy: { sort: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        take,
      });
      results.travels = travels.map((t) => ({
        id: t.id,
        title: t.title,
        content: t.content,
        coverImage: t.images[0]?.url || t.coverImage,
        images: t.images.map((i) => i.url),
        userNickname: t.user.nickname,
        userAvatar: t.user.avatar,
        likeCount: t.likeCount,
        commentCount: t.commentCount,
        createdAt: t.createdAt,
      }));
    }

    results.total = (results.activities?.length || 0) + (results.travels?.length || 0);

    return results;
  }
}
