import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config("kortix-eks");

export const awsRegion = new pulumi.Config("aws").require("region");
export const clusterName = config.require("clusterName");
export const clusterVersion = config.require("clusterVersion");
export const domain = config.require("domain");

export const nodeInstanceType = config.require("nodeInstanceType");
export const nodeMinSize = config.requireNumber("nodeMinSize");
export const nodeDesiredSize = config.requireNumber("nodeDesiredSize");
export const nodeMaxSize = config.requireNumber("nodeMaxSize");
export const nodeDiskSize = config.requireNumber("nodeDiskSize");

export const appPort = config.requireNumber("appPort");
export const appMinReplicas = config.requireNumber("appMinReplicas");
export const appMaxReplicas = config.requireNumber("appMaxReplicas");
export const cpuTargetUtilization = config.requireNumber("cpuTargetUtilization");
export const memoryTargetUtilization = config.requireNumber("memoryTargetUtilization");

export const cpuRequest = config.require("cpuRequest");
export const memoryRequest = config.require("memoryRequest");
export const cpuLimit = config.require("cpuLimit");
export const memoryLimit = config.require("memoryLimit");

export const commonTags = {
  Project: "kortix",
  Environment: "prod",
  ManagedBy: "pulumi",
};

export const appName = "kortix-api";
export const namespace = "kortix";
export const secretName = "kortix/prod/api-config";
export const k8sSecretName = "kortix-api-secrets";
