export interface TargetConfig {
  type: 'illustration' | 'novel';
  tag?: string;
  limit?: number;
  searchTarget?: string;
  sort?: string;
  mode?: string;
  rankingMode?: string;
  rankingDate?: string;
  filterTag?: string;
  minBookmarks?: number;
  startDate?: string;
  endDate?: string;
  seriesId?: number;
  novelId?: number;
  _index?: number;
  _rowKey?: string;
  [key: string]: unknown;
}

