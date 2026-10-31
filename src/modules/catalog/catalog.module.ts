import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';

/** Danh mục chức vụ, bậc và ca làm (catalog) có phiên bản theo tháng áp dụng. */
@Module({ controllers: [CatalogController] })
export class CatalogModule {}
