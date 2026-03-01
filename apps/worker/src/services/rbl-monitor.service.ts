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
  listed: boolean | null; // null = DNS error, could not determine
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
  private reverseIP(ip: string): string {
    return ip.split('.').reverse().join('.');
  }

  /**
   * Check a single IP against a single RBL provider
   */
  async checkSingleRBL(ip: string, rblHost: string): Promise<{ listed: boolean | null; returnCode: string | null }> {
    const query = `${this.reverseIP(ip)}.${rblHost}`;

    try {
      const addresses = await dns.resolve4(query);
      return {
        listed: true,
        returnCode: addresses[0] || null,
      };
    } catch (error: unknown) {
      const dnsError = error as NodeJS.ErrnoException;
      // ENOTFOUND/ENODATA = definitively not listed
      if (dnsError.code === 'ENOTFOUND' || dnsError.code === 'ENODATA') {
        return {
          listed: false,
          returnCode: null,
        };
      }
      // ETIMEOUT, ESERVFAIL, etc. = cannot determine listing status
      return {
        listed: null,
        returnCode: dnsError.code || null,
      };
    }
  }

  /**
   * Check an IP against all RBL providers and persist results.
   * Skips providers that return null (DNS error) — only persists definitive results.
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

      // Only persist definitive results (listed true/false), skip DNS errors (null)
      if (listed !== null) {
        await prisma.rBLCheck.create({
          data: {
            ipAddress: ip,
            ipPoolId: ipPoolId || null,
            provider: provider.host,
            listed,
            returnCode,
          },
        });

        // Auto-resolve previously listed entries when IP is now clean
        if (!listed) {
          await this.markResolved(ip, provider.host);
        }
      }
    }

    return results;
  }

  /**
   * Check all active IP pools against all RBL providers.
   * Aggregates results across ALL IPs before updating pool status.
   */
  async checkAllPools(options?: {
    onListed?: (result: PoolCheckResult) => void;
  }): Promise<PoolCheckResult[]> {
    const pools = await prisma.iPPool.findMany({
      where: { isActive: true },
    });

    const results: PoolCheckResult[] = [];

    for (const pool of pools) {
      let poolHasListedIP = false;
      let poolTotalListings = 0;

      for (const ip of pool.ipAddresses) {
        const checks = await this.checkIP(ip, pool.id);
        // Only definitive listings count (listed === true, not null)
        const definitiveListings = checks.filter((c) => c.listed === true);
        const isListed = definitiveListings.length > 0;

        const poolResult: PoolCheckResult = {
          poolId: pool.id,
          ipAddress: ip,
          isListed,
          listings: definitiveListings,
        };

        results.push(poolResult);

        if (isListed) {
          poolHasListedIP = true;
          poolTotalListings += definitiveListings.length;
          if (options?.onListed) {
            options.onListed(poolResult);
          }
        }
      }

      // Update pool status ONCE after checking all IPs
      await this.updatePoolReputation(pool.id, poolHasListedIP, poolTotalListings);
    }

    return results;
  }

  /**
   * Update pool RBL status and apply reputation penalty if listed.
   * Does NOT reset reputation to 100 when clean — only applies penalties.
   */
  async updatePoolReputation(poolId: string, isListed: boolean, listingCount: number): Promise<void> {
    if (isListed) {
      const reputationPenalty = listingCount * 15;
      const pool = await prisma.iPPool.findUnique({ where: { id: poolId } });
      const currentReputation = pool?.reputation ?? 100;
      const newReputation = Math.max(0, currentReputation - reputationPenalty);

      await prisma.iPPool.update({
        where: { id: poolId },
        data: {
          reputation: newReputation,
          rblListed: true,
          rblLastCheck: new Date(),
        },
      });
    } else {
      // Only update rblListed flag and timestamp, do NOT touch reputation
      await prisma.iPPool.update({
        where: { id: poolId },
        data: {
          rblListed: false,
          rblLastCheck: new Date(),
        },
      });
    }
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
