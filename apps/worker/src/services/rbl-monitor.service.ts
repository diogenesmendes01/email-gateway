import * as dns from 'dns/promises';
import { prisma } from '@email-gateway/database';

export interface RBLProvider {
  host: string;
  name: string;
}

export const RBL_PROVIDERS: RBLProvider[] = [
  { host: 'zen.spamhaus.org', name: 'Spamhaus ZEN' },
  { host: 'b.barracudacentral.org', name: 'Barracuda' },
  { host: 'dnsbl.uceprotect.net', name: 'UCEProtect Level 1' },
  { host: 'bl.spamcop.net', name: 'SpamCop' },
  { host: 'dnsbl.sorbs.net', name: 'SORBS' },
];

export interface RBLCheckResult {
  ipAddress: string;
  provider: string;
  providerName: string;
  listed: boolean;
  returnCode: string | null;
}

export interface PoolCheckResult {
  poolId: string;
  ipAddress: string;
  isListed: boolean;
  listings: RBLCheckResult[];
}

export class RBLMonitorService {
  /**
   * Reverse IP octets for DNSBL lookup (1.2.3.4 -> 4.3.2.1)
   */
  reverseIP(ip: string): string {
    return ip.split('.').reverse().join('.');
  }

  /**
   * Check a single IP against a single RBL provider
   */
  async checkSingleRBL(ip: string, rblHost: string): Promise<{ listed: boolean; returnCode: string | null }> {
    const query = `${this.reverseIP(ip)}.${rblHost}`;

    try {
      const addresses = await dns.resolve4(query);
      return {
        listed: true,
        returnCode: addresses[0] || null,
      };
    } catch (error: any) {
      // ENOTFOUND = not listed (expected), ETIMEOUT/ESERVFAIL = can't determine
      return {
        listed: false,
        returnCode: null,
      };
    }
  }

  /**
   * Check an IP against all RBL providers and persist results
   */
  async checkIP(ip: string, ipPoolId?: string): Promise<RBLCheckResult[]> {
    const results: RBLCheckResult[] = [];

    for (const provider of RBL_PROVIDERS) {
      const { listed, returnCode } = await this.checkSingleRBL(ip, provider.host);

      const result: RBLCheckResult = {
        ipAddress: ip,
        provider: provider.host,
        providerName: provider.name,
        listed,
        returnCode,
      };

      results.push(result);

      // Persist to database
      await prisma.rBLCheck.create({
        data: {
          ipAddress: ip,
          ipPoolId: ipPoolId || null,
          provider: provider.host,
          listed,
          returnCode,
        },
      });
    }

    return results;
  }

  /**
   * Check all active IP pools against all RBL providers
   */
  async checkAllPools(): Promise<PoolCheckResult[]> {
    const pools = await prisma.iPPool.findMany({
      where: { isActive: true },
    });

    const results: PoolCheckResult[] = [];

    for (const pool of pools) {
      for (const ip of pool.ipAddresses) {
        const checks = await this.checkIP(ip, pool.id);
        const isListed = checks.some((c) => c.listed);

        results.push({
          poolId: pool.id,
          ipAddress: ip,
          isListed,
          listings: checks.filter((c) => c.listed),
        });

        // Update pool RBL status
        await prisma.iPPool.update({
          where: { id: pool.id },
          data: {
            rblListed: isListed,
            rblLastCheck: new Date(),
          },
        });
      }
    }

    return results;
  }

  /**
   * Get all currently listed IPs (unresolved)
   */
  async getListedIPs() {
    return prisma.rBLCheck.findMany({
      where: { listed: true, resolvedAt: null },
      orderBy: { checkedAt: 'desc' },
    });
  }

  /**
   * Mark a listing as resolved (IP was delisted)
   */
  async markResolved(ipAddress: string, provider: string): Promise<void> {
    const checks = await prisma.rBLCheck.findMany({
      where: { ipAddress, provider, listed: true, resolvedAt: null },
    });

    for (const check of checks) {
      await prisma.rBLCheck.update({
        where: { id: check.id },
        data: { resolvedAt: new Date() },
      });
    }
  }
}
