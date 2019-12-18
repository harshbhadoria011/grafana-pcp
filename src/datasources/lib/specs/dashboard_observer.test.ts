import _ from 'lodash';
import * as dateMock from 'jest-date-mock';
import { Endpoint } from "../endpoint_registry";
import { PmapiDatasourceBase } from '../datasource_base';
import { PmapiQueryTarget, Query } from '../models/datasource';
import { TargetResult } from '../models/metrics';
import fixtures from './lib/fixtures';
import HttpServerMock from './lib/http_server_mock';

class Datasource extends PmapiDatasourceBase<Endpoint> {
    onTargetUpdate(prevValue: PmapiQueryTarget<Endpoint>, newValue: PmapiQueryTarget<Endpoint>): Promise<void> {
        throw new Error("Method not implemented.");
    }

    onTargetInactive(target: PmapiQueryTarget<Endpoint>): Promise<void> {
        throw new Error("Method not implemented.");
    }

    async handleTarget(query: Query, target: PmapiQueryTarget<Endpoint>): Promise<TargetResult> {
        return {
            target: target,
            metrics: []
        };
    }
}

describe("DashboardObserver", () => {
    const ctx: { datasource: Datasource, onTargetUpdate: jest.Mock, onTargetInactive: jest.Mock } = {} as any;

    beforeEach(() => {
        dateMock.clear();
        const instanceSettings = {
            url: 'http://localhost',
            jsonData: {
                pollIntervalMs: 0,
                scriptSyncIntervalMs: 0,
                inactivityTimeoutMs: '20s'
            }
        };
        const templateSrv = {
            replace: (x: string) => x
        };
        const server = new HttpServerMock(instanceSettings.url, false);
        server.addResponses([
            fixtures.pmapi.PmProxy.context(1),
            fixtures.pmapi.PmProxy.fetchSingleMetric(1, 10, [{ name: "pmcd.version", value: "5.0.2" }])
        ]);
        const backendSrv = {
            datasourceRequest: server.doRequest.bind(server)
        };
        ctx.onTargetUpdate = jest.fn();
        ctx.onTargetInactive = jest.fn();
        ctx.datasource = new Datasource(instanceSettings, backendSrv, templateSrv);
        ctx.datasource.dashboardObserver.onTargetUpdate = ctx.onTargetUpdate;
        ctx.datasource.dashboardObserver.onTargetInactive = ctx.onTargetInactive;
    });

    it("should detect changes", async () => {
        const query = _.cloneDeep(fixtures.grafana.query);
        query.targets.push({
            ...fixtures.grafana.queryTarget,
            expr: "some_query"
        });
        await ctx.datasource.query(query);

        query.targets[0].expr = "updated_expr";
        await ctx.datasource.query(query);
        expect(ctx.onTargetUpdate).toHaveBeenCalledTimes(1);

        await ctx.datasource.query(query);
        expect(ctx.onTargetUpdate).toHaveBeenCalledTimes(1);
    });

    it("should detect inactive targets", async () => {
        const query = _.cloneDeep(fixtures.grafana.query);
        query.targets.push({
            ...fixtures.grafana.queryTarget,
            expr: "some_query"
        });

        dateMock.advanceTo(0);
        await ctx.datasource.query(query);

        dateMock.advanceTo(19000);
        ctx.datasource.dashboardObserver.cleanup();
        expect(ctx.onTargetInactive).toHaveBeenCalledTimes(0);

        dateMock.advanceTo(21000);
        ctx.datasource.dashboardObserver.cleanup();
        expect(ctx.onTargetInactive).toHaveBeenCalledTimes(1);
    });

});
