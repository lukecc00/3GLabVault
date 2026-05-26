import { Module } from '@nestjs/common';
import { GroupModule } from '../group/group.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [GroupModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
