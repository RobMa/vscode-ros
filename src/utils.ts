import * as extension from "./extension";
import * as pfs from "./promise-fs";
import * as cp from "child_process";
import * as _ from "underscore";
import * as vscode from "vscode";
import * as fs from "fs"
import * as xml2js from "xml2js"
import { error } from "util";

/**
 * Gets the ROS config section.
 */
export function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("ros");
}

/**
 * Executes a setup file and returns the resulting env.
 */
export function sourceSetupFile(filename: string, env?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    cp.exec(`bash -c "source '${filename}' && env"`, { env }, (err, out) => {
      if (!err) {
        resolve(out.split("\n").reduce((env, line) => {
          const index = line.indexOf("=");

          if (index !== -1) {
            env[line.substr(0, index)] = line.substr(index + 1);
          }

          return env;
        }, {}));
      } else {
        reject(err);
      }
    });
  });
}

/**
 * Gets the names of installed distros.
 */
export function getDistros(): Promise<string[]> {
  return pfs.readdir("/opt/ros");
}

/**
 * Gets a map of package names to paths.
 */
export function getPackages(): Promise<{ [name: string]: string }> {
  return new Promise((resolve, reject) => cp.exec("rospack list", { env: extension.env }, (err, out) => {
    if (!err) {
      resolve(_.object(out.trim().split("\n").map(line => line.split(" ", 2))));
    } else {
      reject(err);
    }
  }));
}

/**
 * Gets include dirs using `catkin_find`.
 */
export function getIncludeDirs(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    var parser = new xml2js.Parser();
    var projectFilePath = extension.baseDir + "/build/Project.cbp";
    fs.readFile(projectFilePath, function (err, data) {
      if (err){
        reject(new Error('Please build the workspace first.'));
        return;
      }
      parser.parseString(data, function (err, result) {
        if (!err) {
          var includes : string[] = [];
          var targets = result.CodeBlocks_project_file.Project[0].Build[0].Target
          for(let target of targets){
            // Get target type
            var targetType : string = '0';
            for (let option of target.Option){
              if(option.$.hasOwnProperty('type')){
                targetType = option.$.type;
              }
            }
            // Exclude non package type targets, e.g. tests
            if(targetType != '1'){
              // Not a package target -> skip
              continue;
            }
            if(!target.hasOwnProperty('Compiler')){
              // Not a package target -> skip
              continue;
            }
            var targetIncludes = target.Compiler[0].Add;
            for(let include of targetIncludes){
              if (include.$.hasOwnProperty('directory')){
                if(includes.indexOf(include.$.directory) == -1){
                  includes.push(include.$.directory);
                }
              }
            }              
          }
          resolve(includes);
        } else {
          reject(err);
        }
      });
    });
  });
}

/**
 * Gets the full path to any executables for a package.
 */
export function findPackageExecutables(packageName: string): Promise<string[]> {
  const dirs = `catkin_find --without-underlays --libexec --share '${packageName}'`;
  const command = `find $(${dirs}) -type f -executable`;

  return new Promise((c, e) => cp.exec(command, { env: extension.env }, (err, out) =>
    err ? e(err) : c(out.trim().split("\n"))
  ));
}

/**
 * Finds all `.launch` files for a package..
 */
export function findPackageLaunchFiles(packageName: string): Promise<string[]> {
  const dirs = `catkin_find --without-underlays --share '${packageName}'`;
  const command = `find $(${dirs}) -type f -name *.launch`;

  return new Promise((c, e) => cp.exec(command, { env: extension.env }, (err, out) => {
    err ? e(err) : c(out.trim().split("\n"));
  }));
}

/**
 * Creates and shows a ROS-sourced terminal.
 */
export function createTerminal() {
  vscode.window.createTerminal({ name: 'ROS', env: extension.env }).show();
}
