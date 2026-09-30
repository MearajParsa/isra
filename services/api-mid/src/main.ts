import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// پیشوند هدف: /o/v1 (با کارstream API فعال می‌شود)
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3002);
}
void bootstrap();
