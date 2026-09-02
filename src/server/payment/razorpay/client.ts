import Razorpay from 'razorpay';
import { config } from '../../config.js';

export class RazorpayClientService {
  private static instance: Razorpay | null = null;

  /**
   * Determines if valid Razorpay Test Mode credentials are configured in the environment.
   */
  public static isTestModeConfigured(): boolean {
    const keyId = config.RAZORPAY_KEY_ID?.trim() || '';
    const keySecret = config.RAZORPAY_KEY_SECRET?.trim() || '';

    return (
      keyId.length > 0 &&
      keySecret.length > 0 &&
      keyId !== 'rzp_test_placeholder_key_id' &&
      keySecret !== 'placeholder_key_secret'
    );
  }

  /**
   * Returns the Razorpay key_id safe for client-side checkout initiation.
   */
  public static getKeyId(): string {
    return config.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key_id';
  }

  /**
   * Returns the official Razorpay SDK client instance.
   */
  public static getClient(): Razorpay {
    if (!this.instance) {
      this.instance = new Razorpay({
        key_id: config.RAZORPAY_KEY_ID,
        key_secret: config.RAZORPAY_KEY_SECRET,
      });
    }
    return this.instance;
  }
}
