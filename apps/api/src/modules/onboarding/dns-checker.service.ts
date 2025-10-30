import { Injectable, Logger } from '@nestjs/common';
import { Resolver } from 'dns';
import { promisify } from 'util';

@Injectable()
export class DNSCheckerService {
  private readonly logger = new Logger(DNSCheckerService.name);
  private readonly resolver = new Resolver();

  // Set custom DNS servers for reliability
  constructor() {
    // Use Google's public DNS for consistency
    this.resolver.setServers(['8.8.8.8', '8.8.4.4']);
  }

  /**
   * Lookup TXT records for a domain
   */
  async lookupTXT(domain: string): Promise<string[]> {
    try {
      this.logger.debug(`Looking up TXT records for: ${domain}`);

      const resolveTxt = promisify(this.resolver.resolveTxt.bind(this.resolver));
      const records = await resolveTxt(domain);

      // Flatten the array of arrays
      const txtRecords = records.flat().map(record => record.toString());

      this.logger.debug(`Found ${txtRecords.length} TXT records for ${domain}`);
      return txtRecords;
    } catch (error) {
      this.logger.warn(`TXT lookup failed for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Lookup A records for a domain
   */
  async lookupA(domain: string): Promise<string[]> {
    try {
      this.logger.debug(`Looking up A records for: ${domain}`);

      const resolveA = promisify(this.resolver.resolve4.bind(this.resolver));
      const addresses = await resolveA(domain);

      this.logger.debug(`Found ${addresses.length} A records for ${domain}`);
      return addresses;
    } catch (error) {
      this.logger.warn(`A lookup failed for ${domain}:`, error.message);
      throw error; // Re-throw for domains that should exist
    }
  }

  /**
   * Lookup AAAA records for a domain
   */
  async lookupAAAA(domain: string): Promise<string[]> {
    try {
      this.logger.debug(`Looking up AAAA records for: ${domain}`);

      const resolveAAAA = promisify(this.resolver.resolve6.bind(this.resolver));
      const addresses = await resolveAAAA(domain);

      this.logger.debug(`Found ${addresses.length} AAAA records for ${domain}`);
      return addresses;
    } catch (error) {
      this.logger.warn(`AAAA lookup failed for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Lookup CNAME records for a domain
   */
  async lookupCNAME(domain: string): Promise<string[]> {
    try {
      this.logger.debug(`Looking up CNAME records for: ${domain}`);

      const resolveCname = promisify(this.resolver.resolveCname.bind(this.resolver));
      const cnames = await resolveCname(domain);

      this.logger.debug(`Found ${cnames.length} CNAME records for ${domain}`);
      return cnames;
    } catch (error) {
      this.logger.warn(`CNAME lookup failed for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Lookup MX records for a domain
   */
  async lookupMX(domain: string): Promise<Array<{ priority: number; exchange: string }>> {
    try {
      this.logger.debug(`Looking up MX records for: ${domain}`);

      const resolveMx = promisify(this.resolver.resolveMx.bind(this.resolver));
      const mxRecords = await resolveMx(domain);

      this.logger.debug(`Found ${mxRecords.length} MX records for ${domain}`);
      return mxRecords;
    } catch (error) {
      this.logger.warn(`MX lookup failed for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Check if domain resolves to any IP
   */
  async domainResolves(domain: string): Promise<boolean> {
    try {
      const aRecords = await this.lookupA(domain);
      const aaaaRecords = await this.lookupAAAA(domain);

      return aRecords.length > 0 || aaaaRecords.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all DNS records for comprehensive checking
   */
  async getAllRecords(domain: string): Promise<{
    txt: string[];
    a: string[];
    aaaa: string[];
    cname: string[];
    mx: Array<{ priority: number; exchange: string }>;
  }> {
    this.logger.debug(`Getting all DNS records for: ${domain}`);

    const [txt, a, aaaa, cname, mx] = await Promise.all([
      this.lookupTXT(domain),
      this.lookupA(domain).catch(() => []),
      this.lookupAAAA(domain).catch(() => []),
      this.lookupCNAME(domain).catch(() => []),
      this.lookupMX(domain).catch(() => []),
    ]);

    return {
      txt,
      a,
      aaaa,
      cname,
      mx,
    };
  }

  /**
   * Test DNS server connectivity
   */
  async testConnectivity(): Promise<boolean> {
    try {
      // Test with a known domain
      await this.lookupTXT('google.com');
      return true;
    } catch (error) {
      this.logger.error('DNS server connectivity test failed:', error);
      return false;
    }
  }

  /**
   * Validate domain format
   */
  validateDomainFormat(domain: string): boolean {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?)*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  }

  /**
   * Check if domain has proper DNS delegation
   */
  async hasProperDelegation(domain: string): Promise<boolean> {
    try {
      // Check if NS records exist
      const resolveNs = promisify(this.resolver.resolveNs.bind(this.resolver));
      const nsRecords = await resolveNs(domain);
      return nsRecords.length > 0;
    } catch (error) {
      this.logger.warn(`NS lookup failed for ${domain}:`, error.message);
      return false;
    }
  }
}
