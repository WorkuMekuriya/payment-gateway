import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { ServiceApiKeyGuard } from './guards/service-api-key.guard';
import { PaymentWebhookService } from './payment-webhook.service';

@Global()
@Module({
  imports: [HttpModule.register({ timeout: 30_000 })],
  providers: [PaymentWebhookService, ServiceApiKeyGuard],
  exports: [PaymentWebhookService, ServiceApiKeyGuard],
})
export class CommonModule {}
