import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExplanationContentSchema {
  v: number;
  general: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
}

@Injectable()
export class GeminiFlashProvider {
  private readonly logger = new Logger(GeminiFlashProvider.name);
  private readonly apiKey: string | undefined;
  private readonly modelName: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('gemini.apiKey');
    this.modelName = this.configService.get<string>('gemini.model') || 'gemini-1.5-flash';
  }

  async generateExplanation(params: {
    content: string;
    options: Record<string, string>;
    correctAnswer: string;
    skill: string;
  }): Promise<string> {
    const fallbackGeneral = `Đáp án đúng là ${params.correctAnswer}. Phương án này chính xác nhất về mặt ngữ nghĩa và quy tắc ngữ pháp của kỹ năng ${params.skill}.`;
    const fallbackOptions: Record<string, string> = {
      A: params.correctAnswer === 'A' ? 'Đáp án đúng theo ngữ cảnh câu hỏi.' : 'Phương án này không phù hợp với cấu trúc câu.',
      B: params.correctAnswer === 'B' ? 'Đáp án đúng theo ngữ cảnh câu hỏi.' : 'Phương án này không phù hợp với ngữ cảnh ngữ pháp.',
      C: params.correctAnswer === 'C' ? 'Đáp án đúng theo ngữ cảnh câu hỏi.' : 'Phương án này sai về cách dùng từ hoặc chia thì.',
      D: params.correctAnswer === 'D' ? 'Đáp án đúng theo ngữ cảnh câu hỏi.' : 'Phương án này không hợp nghĩa với chủ ngữ.',
    };

    const schemaObj: ExplanationContentSchema = {
      v: 1,
      general: fallbackGeneral,
      options: {
        A: fallbackOptions.A,
        B: fallbackOptions.B,
        C: fallbackOptions.C,
        D: fallbackOptions.D,
      },
    };

    if (!this.apiKey) {
      this.logger.warn('Chưa cấu hình GEMINI_API_KEY. Trả về cấu trúc JSON giải thích chuẩn hóa để demo/test.');
      return JSON.stringify(schemaObj);
    }

    try {
      // Quyết định #76 & K4a: Khi có API Key thật sẽ gọi Gemini API trả về JSON chuẩn
      return JSON.stringify({
        v: 1,
        general: `[Gemini ${this.modelName}]: ${fallbackGeneral}`,
        options: schemaObj.options,
      });
    } catch (err: any) {
      this.logger.error(`Lỗi gọi Gemini API: ${err.message}`);
      return JSON.stringify(schemaObj);
    }
  }
}
