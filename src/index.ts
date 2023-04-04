import type * as tss from "typescript/lib/tsserverlibrary";
import * as fs from "node:fs";
import * as path from "node:path";

function isTzenFile(filePath: string) {
  return filePath.endsWith(".tzen");
}
const init: tss.server.PluginModuleFactory = ({ typescript }) => {
  return {
    create(info) {
      const projectDirPath = path.dirname(info.project.getProjectName());

      const languageServiceHostProxy = new Proxy(info.languageServiceHost, {
        get: (target, key: keyof tss.LanguageServiceHost) => {
          const proxyHandler: Partial<tss.LanguageServiceHost> = {
            getScriptKind: getScriptKindHandler,
            getScriptSnapshot: getScriptSnapshotHandler,
            resolveModuleNameLiterals: getResolveModuleNameHandler,
          };

          return proxyHandler[key] ?? target[key];
        },
      });

      const languageServiceProxy = new Proxy(
        typescript.createLanguageService(languageServiceHostProxy),
        {
          get: (target, key: keyof tss.LanguageService) => {
            const proxyHandler: Partial<tss.LanguageService> = {
              getDefinitionAndBoundSpan: getDefinitionAndBoundSpanHandler,
            };

            return proxyHandler[key] ?? target[key];
          },
        }
      );

      return languageServiceProxy;

      function getScriptKindHandler(filePath: string) {
        if (isTzenFile(filePath)) {
          return typescript.ScriptKind.TS;
        }

        return info.languageServiceHost.getScriptKind!(filePath);
      }

      function getScriptSnapshotHandler(filePath: string) {
        if (isTzenFile(filePath) && fs.existsSync(filePath)) {
          // TODO: 1
          return typescript.ScriptSnapshot.fromString(`export type A = 1;`);
        }

        return info.languageServiceHost.getScriptSnapshot(filePath);
      }

      type TS5Args = Parameters<
        NonNullable<tss.LanguageServiceHost["resolveModuleNameLiterals"]>
      >;
      // Enable import `*.tzen` files in `*.ts` files.
      function getResolveModuleNameHandler(...args: TS5Args) {
        const [moduleNames, containingFile] = args;
        const defaultResolvedModules = info.languageServiceHost
          .resolveModuleNameLiterals!(...args);

        return moduleNames.map(({ text: moduleName }, index) => {
          if (isTzenFile(moduleName)) {
            return {
              resolvedModule: {
                extension: typescript.Extension.Dts,
                isExternalLibraryImport: false,
                resolvedFileName: path.resolve(
                  path.dirname(containingFile),
                  moduleName
                ),
              },
            };
          }

          return defaultResolvedModules[index];
        });
      }

      function getDefinitionAndBoundSpanHandler() {
        const tzenFilePath = path.resolve(projectDirPath, "./a.tzen");
        info.project.projectService.logger.info(
          `[@type-zen/ts-plugin] [tzenFilePath] ${tzenFilePath}`
        );

        return {
          definitions: [
            {
              containerName: "",
              containerKind: typescript.ScriptElementKind.unknown,
              fileName: tzenFilePath,
              kind: typescript.ScriptElementKind.unknown,
              name: "",
              // [Tag1]: ↓ Test Position
              // Click on the `A` type will take you to `col: 5` in the `a.tzen` file.
              textSpan: { start: 5, length: 5 },

              
              // [Tag2]: ↓ Target position
              // textSpan: { start: 52, length: 57 },
              // ↑ `a.tzen`file.content.substring(52, 57) = `Tag: `
            },
          ],
          // ignore
          textSpan: { start: 0, length: 0 },
        };
      }
    },
    getExternalFiles(project) {
      const tzenFilePaths = project
        .getFileNames()
        .filter((filePath) => isTzenFile(filePath));

      return tzenFilePaths;
    },
  };
};

// @ts-ignore
export = init;
