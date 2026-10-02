import { Controller } from '@nestjs/common';
import { In, Route } from '../common/ep';
import { MidClient } from '../mid/mid.client';

@Controller()
export class PublicController {
  constructor(private readonly mid: MidClient) {}

  @Route('L-30')
  list(@In() { query }: { query: { page: number; pageSize: number; status?: string } }) {
    return this.mid.publicSessions(query);
  }

  @Route('L-31')
  one(@In() { params }: { params: { id: string } }) {
    return this.mid.publicSession(params.id);
  }
}
