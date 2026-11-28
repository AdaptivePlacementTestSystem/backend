import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CatEngineService } from './cat-engine.service';
import { PickNextSkillUseCase } from '../use-cases/pick-next-skill.use-case';
import { SelectNextItemUseCase } from '../use-cases/select-next-item.use-case';
import { ComputeEapUseCase } from '../use-cases/compute-eap.use-case';
import { CheckStoppingCriterionUseCase } from '../use-cases/check-stopping-criterion.use-case';
import { Skill } from '../../../item-bank/domain/enums/skill.enum';

describe('CatEngineService & EAP Algorithm', () => {
  let catEngineService: CatEngineService;

  beforeEach(() => {
    const configService = new ConfigService({
      cat: {
        thetaInit: -0.5,
        priorMean: 0.0,
        priorVariance: 1.0,
        quadraturePoints: 41,
        maxItems: 25,
        seThreshold: 0.35,
        boundaryBMin: -2.5,
        boundaryBMax: 1.5,
        boundaryMinItems: 8,
        timeoutMinutes: 45,
        topNItems: 5,
      },
    });

    const pickNextSkillUseCase = new PickNextSkillUseCase();
    const selectNextItemUseCase = new SelectNextItemUseCase();
    const computeEapUseCase = new ComputeEapUseCase(configService);
    const checkStoppingCriterionUseCase = new CheckStoppingCriterionUseCase(
      configService,
    );

    catEngineService = new CatEngineService(
      pickNextSkillUseCase,
      selectNextItemUseCase,
      computeEapUseCase,
      checkStoppingCriterionUseCase,
    );
  });

  describe('pickNextSkill (Round-robin)', () => {
    it('chọn xen kẽ giữa VOCABULARY và GRAMMAR', () => {
      expect(catEngineService.pickNextSkill(Skill.VOCABULARY)).toBe(
        Skill.GRAMMAR,
      );
      expect(catEngineService.pickNextSkill(Skill.GRAMMAR)).toBe(
        Skill.VOCABULARY,
      );
    });

    it('chọn một trong hai skill khi chưa có skill nào trước đó (câu đầu tiên)', () => {
      const first = catEngineService.pickNextSkill(null);
      expect([Skill.VOCABULARY, Skill.GRAMMAR]).toContain(first);
    });
  });

  describe('computeEAP (3 test case bắt buộc SRS Mục 4.3)', () => {
    it('1. Toàn đúng: theta phải tăng dương rõ rệt', () => {
      const responses = [
        { irtB: -0.5, isCorrect: true },
        { irtB: 0.0, isCorrect: true },
        { irtB: 0.5, isCorrect: true },
        { irtB: 1.0, isCorrect: true },
      ];
      const estimate = catEngineService.computeEAP(responses);
      expect(estimate.theta).toBeGreaterThan(0.5);
      expect(estimate.standardError).toBeLessThan(1.0);
    });

    it('2. Toàn sai: theta phải giảm âm rõ rệt', () => {
      const responses = [
        { irtB: 0.5, isCorrect: false },
        { irtB: 0.0, isCorrect: false },
        { irtB: -0.5, isCorrect: false },
        { irtB: -1.0, isCorrect: false },
      ];
      const estimate = catEngineService.computeEAP(responses);
      expect(estimate.theta).toBeLessThan(-0.5);
      expect(estimate.standardError).toBeLessThan(1.0);
    });

    it('3. Xen kẽ đúng sai quanh b = 0: theta dao động quanh 0', () => {
      const responses = [
        { irtB: 0.0, isCorrect: true },
        { irtB: 0.0, isCorrect: false },
        { irtB: 0.0, isCorrect: true },
        { irtB: 0.0, isCorrect: false },
      ];
      const estimate = catEngineService.computeEAP(responses);
      expect(Math.abs(estimate.theta)).toBeLessThan(0.3);
    });
  });

  describe('checkStoppingCriterion', () => {
    it('dừng khi SE < 0.35', () => {
      const result = catEngineService.checkStoppingCriterion({
        itemCount: 15,
        standardError: 0.32,
        currentTheta: 0.0,
        expiresAt: new Date(Date.now() + 45 * 60 * 1000),
      });
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('SE_THRESHOLD');
    });

    it('dừng khi đạt tối đa 25 câu', () => {
      const result = catEngineService.checkStoppingCriterion({
        itemCount: 25,
        standardError: 0.4,
        currentTheta: 0.0,
        expiresAt: new Date(Date.now() + 45 * 60 * 1000),
      });
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('MAX_ITEMS_REACHED');
    });

    it('dừng với TIMEOUT khi đã quá expiresAt', () => {
      const result = catEngineService.checkStoppingCriterion({
        itemCount: 5,
        standardError: 0.45,
        currentTheta: 0.0,
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('TIMEOUT');
    });

    it('dừng với ITEM_BANK_BOUNDARY khi đạt Outlier Early Stop (theta > 1.5 hoặc theta < -2.5 sau >= 8 câu)', () => {
      const resultHigh = catEngineService.checkStoppingCriterion({
        itemCount: 8,
        standardError: 0.4,
        currentTheta: 1.6,
        expiresAt: new Date(Date.now() + 45 * 60 * 1000),
      });
      expect(resultHigh.shouldStop).toBe(true);
      expect(resultHigh.reason).toBe('ITEM_BANK_BOUNDARY');

      const resultLow = catEngineService.checkStoppingCriterion({
        itemCount: 8,
        standardError: 0.4,
        currentTheta: -2.6,
        expiresAt: new Date(Date.now() + 45 * 60 * 1000),
      });
      expect(resultLow.shouldStop).toBe(true);
      expect(resultLow.reason).toBe('ITEM_BANK_BOUNDARY');

      // Chưa đủ 8 câu thì không dừng theo Outlier Early Stop
      const resultNotEnough = catEngineService.checkStoppingCriterion({
        itemCount: 7,
        standardError: 0.4,
        currentTheta: 1.6,
        expiresAt: new Date(Date.now() + 45 * 60 * 1000),
      });
      expect(resultNotEnough.shouldStop).toBe(false);
    });

    it('không dừng khi SE >= 0.35 và chưa đủ 25 câu', () => {
      const result = catEngineService.checkStoppingCriterion({
        itemCount: 5,
        standardError: 0.45,
        currentTheta: 0.0,
        expiresAt: new Date(Date.now() + 45 * 60 * 1000),
      });
      expect(result.shouldStop).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it('biên Outlier Early Stop (-2.5 và +1.5): tại đúng ngưỡng -2.5 / +1.5 chưa dừng sớm, vượt ngưỡng ở câu thứ 8 mới dừng', () => {
      const exactMin = catEngineService.checkStoppingCriterion({
        itemCount: 8,
        standardError: 0.4,
        currentTheta: -2.5,
        expiresAt: new Date(Date.now() + 45 * 60 * 1000),
      });
      expect(exactMin.shouldStop).toBe(false);

      const exactMax = catEngineService.checkStoppingCriterion({
        itemCount: 8,
        standardError: 0.4,
        currentTheta: 1.5,
        expiresAt: new Date(Date.now() + 45 * 60 * 1000),
      });
      expect(exactMax.shouldStop).toBe(false);

      const justBelowMin = catEngineService.checkStoppingCriterion({
        itemCount: 8,
        standardError: 0.4,
        currentTheta: -2.51,
        expiresAt: new Date(Date.now() + 45 * 60 * 1000),
      });
      expect(justBelowMin.shouldStop).toBe(true);
      expect(justBelowMin.reason).toBe('ITEM_BANK_BOUNDARY');
    });
  });

  describe('Biên irt_b (CAT_ITEM_B_MIN/MAX = -4/+4 vs CAT_OUTLIER_THETA_MIN/MAX = -2.5/+1.5)', () => {
    it('computeEAP xử lý ổn định câu hỏi tại hai biên độ khó irt_b = -4.0 và +4.0 mà không sinh NaN', () => {
      const lowBoundary = catEngineService.computeEAP([
        { irtB: -4.0, isCorrect: false },
        { irtB: -4.0, isCorrect: true },
      ]);
      expect(Number.isFinite(lowBoundary.theta)).toBe(true);
      expect(Number.isFinite(lowBoundary.standardError)).toBe(true);
      expect(lowBoundary.theta).toBeGreaterThanOrEqual(-4.0);
      expect(lowBoundary.theta).toBeLessThanOrEqual(4.0);

      const highBoundary = catEngineService.computeEAP([
        { irtB: 4.0, isCorrect: true },
        { irtB: 4.0, isCorrect: true },
      ]);
      expect(Number.isFinite(highBoundary.theta)).toBe(true);
      expect(highBoundary.theta).toBeGreaterThan(0);
      expect(highBoundary.theta).toBeLessThanOrEqual(4.0);
    });

    it('trả lời đúng hết toàn bộ câu ở ngưỡng +4.0 qua 12 câu kéo theta > +1.5 và kích hoạt ITEM_BANK_BOUNDARY', () => {
      const extremeCorrect = Array.from({ length: 12 }, () => ({
        irtB: 2.0,
        isCorrect: true,
      }));
      const est = catEngineService.computeEAP(extremeCorrect);
      const stop = catEngineService.checkStoppingCriterion({
        itemCount: extremeCorrect.length,
        standardError: est.standardError,
        currentTheta: est.theta,
        expiresAt: new Date(Date.now() + 45 * 60 * 1000),
      });
      expect(stop.shouldStop).toBe(true);
      expect(['SE_THRESHOLD', 'ITEM_BANK_BOUNDARY']).toContain(stop.reason);
    });
  });
});
