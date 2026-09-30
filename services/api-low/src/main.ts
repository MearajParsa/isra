import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// پیشوند هدف: /c/v1 (با کارstream API فعال می‌شود)
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
