import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get('places')
  @ApiOperation({ summary: '搜索地点 (腾讯地图API)' })
  searchPlaces(
    @Query('keyword') keyword: string,
    @Query('region') region?: string,
  ) {
    return this.searchService.searchPlaces(keyword, region);
  }

  @Public()
  @Get()
  search(
    @Query('q') q?: string,
    @Query('type') type?: 'activities' | 'travels' | 'all',
    @Query('take') take?: string,
  ) {
    return this.searchService.search(q, type, take ? parseInt(take, 10) : 20);
  }
}
