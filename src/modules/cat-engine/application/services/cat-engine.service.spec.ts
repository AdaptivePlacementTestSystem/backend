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
  });
});
