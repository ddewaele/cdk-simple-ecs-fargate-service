import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';

import { aws_logs } from 'aws-cdk-lib';
import { SubnetType } from 'aws-cdk-lib/aws-ec2';

interface CdkSimpleEcsFargateServiceStackProps extends cdk.StackProps {
  setupDomain?: boolean;
  domainName: string;
  certificateArn: string;
  zoneId: string;
}

export class CdkSimpleEcsFargateServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdkSimpleEcsFargateServiceStackProps) {
    super(scope, id, props);

    // const vpc = ec2.Vpc.fromLookup(this, "VPC", { // no NAT gateway in the default VPC. so fargate services cannot pull images.
    //   isDefault: true,
    // });

    // Create a VPC
    const vpc = new ec2.Vpc(this, 'MyVpc', {
      maxAzs: 2,
      natGateways: 1, // this is needed (30 USD / month)
      subnetConfiguration: [
        {
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'PrivateSubnet',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
      ],
    });


    const cluster = new ecs.Cluster(this, 'EcsCluster', {
      vpc
    });

    // Create an Application Load Balancer
    const loadbalancer = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
      vpc,
      internetFacing: true, // If you want cloudfront to connect to the ALB it needs to be internet facing.
    });

    const logGroup = new aws_logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ecs/service/demoservice',
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Adjust this as needed
    });

    const logging = new ecs.AwsLogDriver({
      streamPrefix: 'ecs',
      logGroup: logGroup,
    });


    // If you want you can specify the architecture there.
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: 512,
      cpu: 256,
      // runtimePlatform: {
      //   cpuArchitecture: ecs.CpuArchitecture.ARM64
      // }
    });

    // you can choose a public or a private ECR repo
    const container = taskDefinition.addContainer('WebContainer', {
      image: ecs.ContainerImage.fromRegistry('nginxdemos/hello'),
      //image: ecs.ContainerImage.fromEcrRepository(ecr.Repository.fromRepositoryArn(this, 'PrivateRepo', 'arn:aws:ecr:eu-central-1:949508759827:repository/nginxdemos/hello'), 'latest'),
      memoryLimitMiB: 512,
      cpu: 256,
      logging: logging,

    });


    // // Add port mappings
    container.addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    // Define an ECS Service
    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 1, // Adjust as necessary
      assignPublicIp: false, // test with this. seems to work fine.
      vpcSubnets: {
        subnetType: SubnetType.PRIVATE_WITH_EGRESS // check these options.
      },
      capacityProviderStrategies: [{
        capacityProvider: 'FARGATE_SPOT', // 70% discount
        weight: 1
      }]
    });


    // The ARN of your ACM certificate
    const certificate = acm.Certificate.fromCertificateArn(this, 'MyCertificate', props.certificateArn);

    let applicationListener;

    if (props?.setupDomain) {

      applicationListener = loadbalancer.addListener('HttpsListener', {
          port: 443,
          certificates: [certificate],
      });

    } else {

      applicationListener = loadbalancer.addListener('HttpsListener', {
        port: 80,
      });

    }

    applicationListener.addTargets('ecs-target-demo', {
      targets: [service],
      deregistrationDelay: cdk.Duration.seconds(10),
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP
    });

    // Create a record to point to the ALB
      new route53.ARecord(this, 'AliasRecord', {
        zone: route53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainName }),
        target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(loadbalancer)),
    });


  }
}
