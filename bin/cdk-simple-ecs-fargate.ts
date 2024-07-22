#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkSimpleEcsFargateServiceStack } from '../lib/cdk-simple-ecs-fargate-service-stack';

const app = new cdk.App();
new CdkSimpleEcsFargateServiceStack(app, 'CdkSimpleEcsFargateStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION
},
  certificateArn: "arn:aws:acm:eu-central-1:949508759827:certificate/ea47a135-8392-4bc9-9ee5-45ff6f89cb7a",
  domainName: "my-tst-playground.com",
  zoneId: "Z10358411VIM0JFAU8TF8",
  setupDomain: true

});