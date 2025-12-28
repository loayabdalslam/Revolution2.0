export class CreditManager {
  constructor(pricePer1kTokens = 0.01) {
    this.pricePer1kTokens = pricePer1kTokens;
    this.byUser = new Map();
  }

  recordUsage(userId, inputTokens, outputTokens) {
    const current = this.byUser.get(userId) || {
      inputTokens: 0,
      outputTokens: 0,
      creditsUsed: 0,
    };

    const totalTokens = inputTokens + outputTokens;
    current.inputTokens += inputTokens;
    current.outputTokens += outputTokens;
    current.creditsUsed += (totalTokens / 1000) * this.pricePer1kTokens;

    this.byUser.set(userId, current);
  }

  getUsage(userId) {
    return (
      this.byUser.get(userId) || {
        inputTokens: 0,
        outputTokens: 0,
        creditsUsed: 0,
      }
    );
  }
}
