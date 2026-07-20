<template>
  <div v-if="workflow" v-loading="pageBusy" class="detail-page">
    <section class="workspace-band requirement-hero">
      <div class="requirement-hero-top">
        <div class="requirement-breadcrumb">
          <span>需求</span>
          <span>/</span>
          <strong>{{ workflow.requirementId }}</strong>
        </div>
        <div class="requirement-hero-actions">
        <div class="requirement-execution-controls">
                    <el-select v-model="selectedAgentId" class="execution-select agent-select" placeholder="选择 Agent">
                      <el-option v-for="agent in store.agents" :key="agent.id" :label="agent.name" :value="agent.id">
                        <span>{{ agent.name }}</span>
                        <span class="muted" style="float: right">{{ agent.available ? '可用' : '不可用' }}</span>
                      </el-option>
                    </el-select>
                    <el-select v-model="selectedExecutionMode" class="execution-select mode-select" placeholder="执行方式">
                      <!-- <el-option label="后台执行" value="BACKGROUND" /> -->
                      <!-- <el-option label="本地终端" value="TERMINAL" /> -->
                      <el-option label="交互终端" value="INTERACTIVE_TERMINAL" />
                      <el-option label="手动复制" value="MANUAL_COPY" />
                    </el-select>
                  </div>
          <el-button :icon="Collection" @click="$router.push({ name: 'project-memory-candidates', query: { requirementId: workflow.requirementId } })">经验记忆</el-button>
          <el-button :icon="Refresh" @click="runRefresh">刷新产物</el-button>
          <el-button :icon="Back" @click="$router.push('/')">返回列表</el-button>
        </div>
      </div>
      <h2 class="requirement-title">{{ workflow.title }}</h2>
      <div class="requirement-meta">
        <el-tag size="small" :type="requirementTypeTagType(workflow.requirementType)" effect="light">{{ requirementTypeText }}</el-tag>
        <el-tag size="small" :type="statusTagType(workflow.status)" effect="light">{{ statusLabels[workflow.status] }}</el-tag>
        <el-tag v-if="workflow.onlineClientCount !== undefined" size="small" type="success" effect="plain">在线 {{ workflow.onlineClientCount }}</el-tag>
        <el-tag v-if="workflow.pendingReviewCount !== undefined" size="small" type="warning" effect="plain">待审 {{ workflow.pendingReviewCount }}</el-tag>
        <el-tag v-if="workflow.jobStatus" size="small" type="info" effect="plain">{{ workflow.jobStatus }}</el-tag>
        <el-tag size="small" :type="realtimeStatusType" effect="plain">{{ realtimeStatusText }}</el-tag>
        <span class="branch-pill">{{ workflow.branchName || '未绑定分支' }}</span>
      </div>
      <div class="token-summary-strip">
        <span class="token-summary-item">
          <small>累计 Token</small>
          <strong>{{ formatTokenCount(requirementTokenSummary.totalTokens) }}</strong>
        </span>
        <span class="token-summary-item">
          <small>输入</small>
          <strong>{{ formatTokenCount(requirementTokenSummary.inputTokens) }}</strong>
        </span>
        <span class="token-summary-item">
          <small>输出</small>
          <strong>{{ formatTokenCount(requirementTokenSummary.outputTokens) }}</strong>
        </span>
        <span class="token-summary-item">
          <small>推理输出</small>
          <strong>{{ formatTokenCount(requirementTokenSummary.reasoningOutputTokens) }}</strong>
        </span>
        <el-button
          v-if="requirementTokenSummary.detailCount"
          link
          class="token-summary-note token-detail-trigger"
          @click="openTokenUsageDetails"
        >
          明细 {{ requirementTokenSummary.detailCount }} 条
        </el-button>
        <span v-else class="token-summary-note">暂无 token 用量</span>
      </div>
      <el-alert
        v-if="workspaceBlockerText"
        type="warning"
        show-icon
        :title="workspaceBlockerText"
        class="workspace-state-alert"
      />
      <StageTimeline v-model="activeStage" :workflow="workflow" />
    </section>

    <div class="stage-grid">
      <main>
        <section class="workspace-band stage-panel">
          <div class="toolbar stage-panel-header">
            <div>
              <strong>{{ stageLabels[activeStage] }}</strong>
              <p class="muted">{{ stageHint }}</p>
            </div>
            <div class="stage-toolbar-actions">
              <el-button
                v-if="activeStage !== 'IMPLEMENTATION'"
                :icon="DocumentChecked"
                :disabled="activeStage === 'RETROSPECTIVE' && !canReviewRetrospectiveStage"
                :title="retrospectiveReviewTitle"
                @click="openStageReview"
              >
                {{ activeStage === 'RETROSPECTIVE' ? '审核复盘' : '审核' }}
              </el-button>
              <el-button
                v-else
                :icon="DocumentChecked"
                :disabled="!canReviewImplementationStage"
                :title="canReviewImplementationStage ? '审核实施验证并同步产物' : '四个实施验证子步骤全部通过后才可审核实施验证'"
                @click="openStageReview"
              >
                审核实施验证
              </el-button>
              <el-button v-if="currentStageRun" :icon="Tickets" @click="openRunLog(currentStageRun.id)">本步骤日志</el-button>
              <el-button v-if="currentStageRun" link class="stage-token-button" @click="openRunLog(currentStageRun.id)">
                Token {{ currentRunTokenText }}
              </el-button>
              <el-button v-if="currentStageRun?.status === 'RUNNING'" type="danger" @click="cancelRun(currentStageRun.id)">取消</el-button>
            </div>
          </div>

          <div class="stage-content">
            <div v-if="activeStage === 'PRD'" class="stage-actions">
              <el-input v-model="sourceText" type="textarea" :rows="3" placeholder="填写外部 PRD 来源，每行一个，例如飞书、设计稿或在线文档链接" />
              <SupplementInputSummary
                :text="prdClarification"
                :blocks="prdSupplementBlocks"
                :files="prdSourceFiles"
                @edit="prdSupplementDialogVisible = true"
              />
              <div class="action-line">
                <el-button type="primary" :icon="primaryActionIcon(Operation)" @click="runPrd">{{ actionButtonText('生成 PRD') }}</el-button>
                <el-button :disabled="!canClarifyPrd" :icon="ChatLineSquare" @click="openPrdClarificationDialog">澄清 PRD</el-button>
                <span v-if="requiresPrdApproval && !canClarifyPrd" class="muted">请先生成 PRD 文档后再澄清。</span>
              </div>
              <section class="stage-artifact-section prd-artifact-section" aria-label="PRD 产物">
                <div class="section-title stage-artifact-heading">
                  <div>
                    <strong>PRD 产物</strong>
                    <p class="muted">{{ selectedPrdEditorPath || '点击右侧编辑打开全屏编辑' }}</p>
                  </div>
                  <span class="muted">{{ prdArtifactSummaryText }}</span>
                </div>
                <el-empty v-if="!prdArtifactItems.length" description="暂无 PRD 产物" />
                <div v-else class="prd-artifact-list">
                  <div
                    v-for="artifact in prdArtifactItems"
                    :key="artifact.id"
                    class="prd-artifact-row"
                    :class="{ active: artifact.path === selectedPrdEditorPath }"
                  >
                    <span class="prd-artifact-icon">
                      <CopyDocument />
                    </span>
                    <div class="prd-artifact-main">
                      <strong>{{ artifact.label }}</strong>
                      <small>{{ artifact.exists ? artifact.path : '未生成' }}</small>
                      <small v-if="artifactVersionText(artifact)" class="version-line">{{ artifactVersionText(artifact) }}</small>
                    </div>
                    <el-tag class="prd-artifact-status" size="small" :type="artifact.exists ? 'success' : 'info'" effect="light">
                      {{ artifact.exists ? '已生成' : '未生成' }}
                    </el-tag>
                    <div class="prd-artifact-actions">
                      <el-button size="small" :icon="View" :disabled="!artifact.exists" @click="previewArtifact(artifact)">预览</el-button>
                      <el-button size="small" type="primary" plain :icon="EditPen" :disabled="!artifact.exists" @click="selectPrdArtifactForEdit(artifact)">编辑</el-button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div v-else-if="activeStage === 'TECH_DESIGN'" class="stage-actions">
              <el-alert v-if="requiresPrdApproval && !prdApproved" type="warning" show-icon title="需要先通过 PRD 审核" />
              <el-descriptions v-if="requiresPrdApproval" :column="1" border class="design-source-summary">
                <el-descriptions-item label="PRD 文档">
                  <span class="design-source-path">{{ prdDesignSourcePath || '未关联' }}</span>
                </el-descriptions-item>
              </el-descriptions>
              <section class="design-input-panel" aria-label="技术方案生成输入">
                <div class="design-input-heading">
                  <div>
                    <strong>增量上下文</strong>
                    <p class="muted">仅新增答疑、批注、补充输入会纳入下一次生成。</p>
                  </div>
                </div>
                <div class="design-context-grid">
                  <section class="design-context-card design-question-card" aria-label="技术方案答疑上下文">
                    <div class="design-context-card-header">
                      <div>
                        <strong>技术方案答疑</strong>
                        <p class="muted">新增答疑会纳入下一次技术方案生成。</p>
                      </div>
                      <el-button class="design-question-entry-button" :icon="ChatLineSquare" @click="openDesignQuestionDialog">
                        {{ techDesignQuestionButtonText }}
                      </el-button>
                    </div>
                    <div v-if="pendingTechDesignQuestionContextPaths.length" class="design-question-context">
                      <span class="context-badge">新增答疑</span>
                      <span>{{ pendingTechDesignQuestionContextText }}</span>
                      <small>将纳入下一次生成</small>
                    </div>
                    <div v-else class="design-question-empty">
                      <span class="context-badge is-muted">暂无新增</span>
                      <span>可记录评审疑问，生成后自动进入增量上下文。</span>
                    </div>
                  </section>
                  <section class="design-context-card design-supplement-card" aria-label="技术方案补充说明">
                    <div class="design-context-card-header">
                      <div>
                        <strong>补充说明</strong>
                        <p class="muted">可补充文本、截图、设计稿或文件。</p>
                      </div>
                    </div>
                    <SupplementInputSummary
                      :text="designClarification"
                      :blocks="techDesignSupplementBlocks"
                      :files="techDesignSourceFiles"
                      @edit="techDesignSupplementDialogVisible = true"
                    />
                    <p class="design-supplement-note muted">补充输入成功生成后自动清空，失败时保留。</p>
                  </section>
                </div>
                <div class="design-run-footer">
                  <span class="muted">确认增量上下文后生成最新技术方案。</span>
                  <div class="design-run-actions">
                    <el-button class="design-run-button" type="primary" :disabled="!canRunDesign" :icon="primaryActionIcon(Operation)" @click="runDesign">
                      {{ actionButtonText('生成技术方案') }}
                    </el-button>
                  </div>
                </div>
              </section>
              <section class="stage-artifact-section" aria-label="技术方案产物">
                <div class="section-title stage-artifact-heading">
                  <div>
                    <strong>技术方案产物</strong>
                    <p class="muted">{{ technicalDesignEditorPath || '尚未关联产物' }}</p>
                  </div>
                </div>
                <div class="artifact-edit-card">
                  <span class="prd-artifact-icon">
                    <CopyDocument />
                  </span>
                  <div class="artifact-edit-main">
                    <strong>技术方案</strong>
                    <small>{{ technicalDesignEditorPath || '未生成' }}</small>
                  </div>
                  <div class="artifact-edit-actions">
                    <el-button :icon="View" :disabled="!technicalDesignEditorPath" @click="previewArtifactPath('TECH_DESIGN', '技术方案', technicalDesignEditorPath)">预览</el-button>
                    <el-button type="primary" plain :icon="EditPen" :disabled="!technicalDesignEditorPath" @click="openArtifactEditor('技术方案', technicalDesignEditorPath)">编辑</el-button>
                  </div>
                </div>
              </section>
            </div>

            <div v-else-if="activeStage === 'IMPLEMENTATION'" class="stage-actions">
              <nav class="implementation-step-nav" aria-label="实施验证子步骤">
                <button
                  v-for="(step, index) in implementationStepItems"
                  :key="step.step"
                  class="implementation-step-button"
                  :class="{ active: activeImplementationStep === step.step, approved: step.status === 'APPROVED' }"
                  type="button"
                  @click="activeImplementationStep = step.step"
                >
                  <span class="step-index">{{ index + 1 }}</span>
                  <span class="step-main">
                    <strong>{{ step.label }}</strong>
                    <small>{{ statusLabels[step.status] }}</small>
                  </span>
                </button>
              </nav>
              <section class="implementation-summary-strip" aria-label="实施验证摘要">
                <div class="summary-main">
                  <div class="summary-heading">
                    <strong>OpenSpec</strong>
                    <el-tag :type="openSpecSummary?.archived ? 'success' : 'primary'" size="small" effect="light">
                      {{ implementationArchiveStatus }}
                    </el-tag>
                  </div>
                  <p class="summary-path">{{ implementationOpenSpecPath }}</p>
                  <el-progress :percentage="openSpecTaskPercentage" :stroke-width="8" />
                </div>
                <div class="summary-metrics">
                  <span class="metric-card done">
                    <small>已完成</small>
                    <strong>{{ openSpecSummary?.tasks.completed || 0 }}</strong>
                  </span>
                  <span class="metric-card pending">
                    <small>待完成</small>
                    <strong>{{ openSpecPendingTaskCount }}</strong>
                  </span>
                  <span class="metric-card issue">
                    <small>问题</small>
                    <strong>{{ openIssueCount }}</strong>
                  </span>
                  <span class="metric-card total">
                    <small>总任务</small>
                    <strong>{{ openSpecSummary?.tasks.total || 0 }}</strong>
                  </span>
                </div>
              </section>

              <template v-if="activeImplementationStep === 'START_CHANGE'">
                <div class="action-line">
                  <el-input v-model="changeName" placeholder="OpenSpec change name，例如 req-172014" />
                  <el-button type="primary" :disabled="!canRunOpenSpecNewChange" :icon="primaryActionIcon(Operation)" @click="runOpenSpecNewChange">
                    {{ actionButtonText('开始变更') }}
                  </el-button>
                  <el-button :icon="primaryActionIcon(DataAnalysis)" @click="runOpenSpecStatus">{{ actionButtonText('查看 OpenSpec 状态') }}</el-button>
                  <el-button :icon="DocumentChecked" @click="openImplementationStepReview">审核本步骤</el-button>
                </div>
                <el-alert v-if="!techDesignApproved" type="warning" show-icon title="需要先通过技术方案审核" />
                <el-alert v-else-if="openSpecChangeExists" type="success" show-icon title="已检测到对应 OpenSpec 变更目录，无需重复开始变更" />
              </template>

              <template v-if="activeImplementationStep === 'ARTIFACT_REVIEW'">
                <section class="openspec-artifact-input-panel" aria-label="OpenSpec 工件输入">
                  <div class="section-title stage-artifact-heading">
                    <div>
                      <strong>工件输入</strong>
                      <p class="muted">先确认版本差异，再选择视觉上下文和补充输入，最后执行工件生成。</p>
                    </div>
                  </div>
                  <section class="openspec-version-context-panel" aria-label="版本对比">
                    <div class="section-title openspec-version-heading">
                      <div>
                        <strong>技术方案版本对比</strong>
                        <p class="muted">基线版本、目标版本的差异会输入到工件生成的上下文中。</p>
                      </div>
                    </div>
                    <div class="openspec-version-grid">
                      <div class="openspec-version-field">
                        <span>基线版本</span>
                        <div v-if="!openSpecBaseVersionManual" class="openspec-auto-base-version">
                          <div>
                            <strong>{{ openSpecBaseVersionText }}</strong>
                            <small>自动基线</small>
                          </div>
                          <el-button class="openspec-edit-base-button" link :icon="EditPen" title="修改基线版本" @click="enableManualOpenSpecBaseVersion" />
                        </div>
                        <div v-else class="openspec-manual-base-version">
                          <TechDesignVersionSelector
                            v-model="openSpecBaseVersionId"
                            :versions="openSpecTechDesignVersions"
                            :loading="openSpecVersionLoading"
                            :show-compare="false"
                          />
                          <el-button class="openspec-restore-base-button" size="small" @click="restoreAutoOpenSpecBaseVersion">恢复自动</el-button>
                        </div>
                      </div>
                      <div class="openspec-version-field">
                        <span>目标版本</span>
                        <TechDesignVersionSelector
                          v-model="openSpecTargetVersionId"
                          :versions="openSpecTechDesignVersions"
                          :loading="openSpecVersionLoading"
                          :show-compare="false"
                        />
                      </div>
                      <div class="openspec-version-field openspec-version-compare-field">
                        <span>版本差异</span>
                        <el-button class="openspec-version-compare-button" :disabled="openSpecReadableTechDesignVersions.length < 2" @click="openOpenSpecVersionDiff">对比版本</el-button>
                      </div>
                    </div>
                  </section>
                  <OpenSpecVisualContextPicker
                    :candidates="openSpecVisualContextCandidates"
                    :selected-paths="openSpecVisualContextPaths"
                    :project-id="currentProjectId"
                    :loading="openSpecVisualContextLoading"
                    @update:selected-paths="handleOpenSpecVisualContextSelection"
                  />
                  <SupplementInputSummary
                    title="工件补充输入"
                    :text="openSpecArtifactAdjustment"
                    :blocks="openSpecSupplementBlocks"
                    :files="openSpecSupplementFiles"
                    @edit="openSpecSupplementDialogVisible = true"
                  />
                </section>
                <div class="action-line openspec-command-line">
                  <el-input v-model="changeName" placeholder="OpenSpec change name，例如 req-172014" />
                  <el-button type="primary" :disabled="!canRunOpenSpecArtifacts" :icon="primaryActionIcon(Operation)" @click="runOpenSpecArtifacts">
                    {{ actionButtonText(openSpecArtifactActionText) }}
                  </el-button>
                  <el-button :icon="primaryActionIcon(DataAnalysis)" @click="runOpenSpecStatus">{{ actionButtonText('查看 OpenSpec 状态') }}</el-button>
                  <el-button :icon="DocumentChecked" @click="openImplementationStepReview">审核本步骤</el-button>
                </div>
                <el-alert v-if="implementationStepStates.START_CHANGE.status !== 'APPROVED'" type="warning" show-icon title="请先完成并审核开始变更步骤" />
                <el-alert v-else-if="!techDesignApproved" type="warning" show-icon title="需要先通过技术方案审核" />
                <OpenSpecDocuments
                  v-if="openSpecDocuments.length"
                  v-model="selectedOpenSpecDocPath"
                  :documents="openSpecDocuments"
                  :root-path="openSpecSummary?.rootPath"
                  @preview="previewOpenSpecDocument"
                  @edit="editOpenSpecDocument"
                />
              </template>

              <template v-if="activeImplementationStep === 'APPLY'">
                <div class="action-line">
                  <el-input v-model="changeName" placeholder="OpenSpec change name，例如 req-172014" />
                  <el-button type="primary" :disabled="!canRunOpenSpecApply" :icon="primaryActionIcon(Operation)" @click="runOpenSpecApply">
                    {{ actionButtonText('开始实施') }}
                  </el-button>
                  <el-button :disabled="!canRunOpenSpecApply" :icon="primaryActionIcon(DataAnalysis)" @click="runOpenSpecVerify">
                    {{ actionButtonText('发起验证') }}
                  </el-button>
                  <el-button :icon="DocumentChecked" @click="openImplementationStepReview">审核本步骤</el-button>
                </div>
                <el-alert v-if="!canRunOpenSpecApply" type="warning" show-icon title="请先通过 OpenSpec 工件评审" />
              </template>

              <section v-if="activeImplementationStep === 'APPLY'" class="openspec-section">
                <div class="section-title">
                  <strong>任务完成情况</strong>
                  <span class="muted">{{ openSpecSummary ? `${openSpecTaskPercentage}%` : '未读取' }}</span>
                </div>
                <el-progress :percentage="openSpecTaskPercentage" />
                <div v-if="openSpecSummary?.tasks.groups.length" class="openspec-task-list">
                  <section v-for="group in openSpecSummary.tasks.groups" :key="group.title" class="openspec-task-group">
                    <strong>{{ group.title }}</strong>
                    <div v-for="task in group.items" :key="`${group.title}-${task.line}`" class="openspec-task-row" :class="{ done: task.completed }">
                      <el-checkbox
                        :model-value="task.completed"
                        :disabled="openSpecSummary?.archived"
                        @change="(value) => toggleOpenSpecTask(task, value === true)"
                      />
                      <span class="openspec-task-id">{{ task.id || '-' }}</span>
                      <span>{{ task.title }}</span>
                    </div>
                  </section>
                </div>
                <el-empty v-else description="暂无任务" />
              </section>

              <template v-if="activeImplementationStep === 'CHANGE_INSPECTION'">
                <div class="action-line">
                  <el-button :icon="Refresh" @click="loadGitChanges">刷新变更</el-button>
                  <el-button :disabled="!canInspectChanges" :icon="DocumentChecked" @click="openImplementationStepReview">审核本步骤</el-button>
                </div>
                <el-alert v-if="!canInspectChanges" type="warning" show-icon title="请先完成并审核开始实施步骤" />
                <GitChangeInspector :summary="gitChanges" :requirement-id="workflow.requirementId" @updated="gitChanges = $event" />
              </template>

              <section class="openspec-section junit-report-section">
                <div class="section-title">
                  <strong>单元测试报告</strong>
                  <span class="muted">{{ junitArtifactPath || '未生成' }}</span>
                </div>
                <div v-if="junitArtifact" class="report-entry">
                  <span class="report-path">{{ junitArtifact.path }}</span>
                  <el-button :icon="View" @click="previewArtifact(junitArtifact)">查看报告</el-button>
                </div>
                <el-alert v-else type="warning" show-icon title="尚未扫描到单元测试报告，开始实施任务应产出 docs/{需求号}/junit/** 报告作为验证证据" />
              </section>

            </div>

            <div v-else-if="activeStage === 'CODE_REVIEW'" class="stage-actions">
              <div class="action-line">
                <el-input v-model="branchName" placeholder="分支名，例如 feature/opp-172014" />
                <el-radio-group v-model="codeReviewMode" size="small">
                  <el-radio-button label="commit">正式评审</el-radio-button>
                  <el-radio-button label="staged">暂存区预审</el-radio-button>
                </el-radio-group>
                <el-button type="primary" :icon="primaryActionIcon(Operation)" @click="runCodeReview">{{ actionButtonText('生成代码评审') }}</el-button>
                <el-button type="danger" :icon="Back" @click="returnToImplementation">打回实施</el-button>
                <el-button v-if="canArchiveOpenSpec" type="success" :icon="primaryActionIcon(DocumentChecked)" @click="runOpenSpecArchive">
                  {{ actionButtonText('归档 OpenSpec') }}
                </el-button>
              </div>
              <el-alert v-if="codeReviewMode === 'staged'" type="warning" show-icon title="暂存区预审仅基于 git diff --cached，不作为正式合并判定" />
              <el-alert v-if="openSpecSummary?.archived" type="success" show-icon :title="`OpenSpec 已归档：${openSpecSummary.archivePath}`" />
              <section class="stage-artifact-section" aria-label="代码评审产物">
                <div class="section-title stage-artifact-heading">
                  <div>
                    <strong>代码评审产物</strong>
                    <p class="muted">{{ codeReviewArtifactPath || '尚未生成代码评审汇总' }}</p>
                  </div>
                </div>
                <div class="artifact-edit-card">
                  <span class="prd-artifact-icon">
                    <CopyDocument />
                  </span>
                  <div class="artifact-edit-main">
                    <strong>代码评审汇总</strong>
                    <small>{{ codeReviewArtifactPath || '未生成' }}</small>
                  </div>
                  <div class="artifact-edit-actions">
                    <el-button :icon="View" :disabled="!codeReviewArtifactPath" @click="previewArtifactPath('CODE_REVIEW', '代码评审汇总', codeReviewArtifactPath)">预览</el-button>
                    <el-button type="primary" plain :icon="EditPen" :disabled="!codeReviewArtifactPath" @click="openArtifactEditor('代码评审汇总', codeReviewArtifactPath)">编辑</el-button>
                  </div>
                </div>
              </section>
            </div>

            <div v-else-if="activeStage === 'RETROSPECTIVE'" class="stage-actions retrospective-workbench">
              <div class="action-line">
                <el-input v-model="retrospectiveFocus" placeholder="复盘关注点（可选），例如：记忆引用是否有效、哪些澄清值得沉淀" />
                <el-button type="primary" :disabled="!codeReviewApproved" :icon="primaryActionIcon(Operation)" @click="runRetrospective">
                  {{ actionButtonText('生成交付复盘') }}
                </el-button>
                <el-button :icon="Refresh" :loading="retrospectiveLoading" @click="loadRetrospective">刷新复盘</el-button>
              </div>
              <el-alert v-if="!codeReviewApproved" type="warning" show-icon title="需要先通过代码评审后再生成交付复盘" />
              <el-alert v-if="workflow.retrospective?.invalidatedAt" type="warning" show-icon :title="`复盘已失效：${workflow.retrospective.invalidatedReason || '上游产物发生变更'}`" />
              <el-alert v-if="retrospectiveSummary?.parseError" type="warning" show-icon :title="retrospectiveSummary.parseError" />
              <section class="implementation-summary-strip retrospective-summary-strip" aria-label="交付复盘摘要">
                <div class="summary-main">
                  <div class="summary-heading">
                    <strong>交付复盘</strong>
                    <el-tag :type="canReviewRetrospectiveStage ? 'success' : 'warning'" size="small" effect="light">
                      {{ canReviewRetrospectiveStage ? '可审核' : '待处理' }}
                    </el-tag>
                  </div>
                  <p class="summary-path">{{ retrospectiveEditorPath || '尚未生成复盘报告' }}</p>
                </div>
                <div class="summary-metrics retrospective-metrics">
                  <span class="metric-card done">
                    <small>沟通证据</small>
                    <strong>{{ retrospectiveSummary?.evidenceCount || 0 }}</strong>
                  </span>
                  <span class="metric-card total">
                    <small>候选经验</small>
                    <strong>{{ retrospectiveSummary?.candidateCount || 0 }}</strong>
                  </span>
                  <span class="metric-card pending">
                    <small>待确认</small>
                    <strong>{{ retrospectiveSummary?.pendingCandidateCount || 0 }}</strong>
                  </span>
                  <span class="metric-card issue">
                    <small>未关闭风险</small>
                    <strong>{{ retrospectiveSummary?.unresolvedRiskCount || 0 }}</strong>
                  </span>
                </div>
              </section>

              <el-tabs v-model="retrospectiveActiveTab" class="retrospective-tabs">
                <el-tab-pane label="复盘报告" name="summary">
                  <section class="stage-artifact-section" aria-label="交付复盘报告">
                    <div class="section-title stage-artifact-heading">
                      <div>
                        <strong>交付复盘报告</strong>
                        <p class="muted">{{ retrospectiveEditorPath || '尚未生成复盘报告' }}</p>
                      </div>
                    </div>
                    <div class="artifact-edit-card">
                      <span class="prd-artifact-icon">
                        <CopyDocument />
                      </span>
                      <div class="artifact-edit-main">
                        <strong>交付复盘报告</strong>
                        <small>{{ retrospectiveEditorPath || '未生成' }}</small>
                      </div>
                      <div class="artifact-edit-actions">
                        <el-button :icon="View" :disabled="!retrospectiveEditorPath" @click="previewArtifactPath('RETROSPECTIVE', '交付复盘报告', retrospectiveEditorPath)">预览</el-button>
                        <el-button
                          type="primary"
                          plain
                          :icon="EditPen"
                          :disabled="!retrospectiveEditorPath"
                          @click="openArtifactEditor('交付复盘报告', retrospectiveEditorPath, reloadRetrospectiveArtifacts)"
                        >
                          编辑
                        </el-button>
                      </div>
                    </div>
                  </section>
                </el-tab-pane>
                <el-tab-pane label="沟通脉络" name="timeline">
                  <div v-if="retrospectiveEvidenceItems.length" class="retrospective-timeline">
                    <article v-for="item in retrospectiveEvidenceItems" :key="item.id" class="retrospective-timeline-item">
                      <span class="timeline-dot" />
                      <div class="timeline-card">
                        <div class="timeline-card-heading">
                          <strong>{{ evidenceSourceText(item.sourceType) }}</strong>
                          <el-tag v-if="item.actor" size="small" effect="plain">{{ item.actor }}</el-tag>
                          <small v-if="item.createdAt" class="muted">{{ item.createdAt }}</small>
                        </div>
                        <p>{{ item.quote || '未提供摘要' }}</p>
                        <small class="muted">{{ item.path || item.artifactPath || '-' }}{{ item.runId ? ` · ${item.runId}` : '' }}</small>
                      </div>
                    </article>
                  </div>
                  <el-empty v-else description="暂无结构化沟通证据" />
                  <div v-if="retrospectiveArtifactItems.length" class="retrospective-artifact-list">
                    <strong>复盘产物</strong>
                    <div v-for="artifact in retrospectiveArtifactItems" :key="artifact.path" class="report-entry">
                      <span class="report-path">{{ artifact.path }}</span>
                      <el-button :icon="View" @click="previewArtifact(artifact)">查看</el-button>
                    </div>
                  </div>
                </el-tab-pane>
                <el-tab-pane label="候选经验" name="candidates">
                  <div class="candidate-review-toolbar">
                    <el-radio-group v-model="retrospectiveCandidateStatusFilter" size="small">
                      <el-radio-button
                        v-for="option in retrospectiveCandidateStatusOptions"
                        :key="option.value"
                        :label="option.value"
                      >
                        {{ option.label }} {{ retrospectiveCandidateStats[option.value] }}
                      </el-radio-button>
                    </el-radio-group>
                    <p class="muted">AI 只生成候选草稿；请人工修改、忽略噪音、标记仅本需求或确认沉淀。</p>
                  </div>
                  <MemoryCandidateTable
                    :items="filteredRetrospectiveCandidates"
                    :loading="retrospectiveLoading"
                    show-source
                    @confirm="confirmRetrospectiveCandidate"
                    @edit="editRetrospectiveCandidate"
                    @pending="markRetrospectiveCandidatePending"
                    @local="markRetrospectiveCandidateLocal"
                    @ignore="ignoreRetrospectiveCandidate"
                  />
                  <el-empty v-if="!retrospectiveCandidates.length && !retrospectiveLoading" description="暂无候选经验">
                    <template #description>
                      <div class="candidate-empty">
                        <strong>暂无候选经验</strong>
                        <span>如果复盘结论为“无可复用经验”，可继续审核；如果预期应有候选，请检查 memory-candidates.json 是否为空或是否导入成功。</span>
                      </div>
                    </template>
                  </el-empty>
                  <el-empty
                    v-else-if="!filteredRetrospectiveCandidates.length && !retrospectiveLoading"
                    description="当前筛选下暂无候选经验"
                  />
                </el-tab-pane>
                <el-tab-pane label="引用反馈" name="recall">
                  <el-table v-if="retrospectiveRecallFeedback.length" :data="retrospectiveRecallFeedback" style="width: 100%">
                    <el-table-column prop="memoryId" label="记忆 ID" min-width="220" />
                    <el-table-column prop="status" label="效果" width="130">
                      <template #default="{ row }">
                        <el-tag effect="plain">{{ recallFeedbackStatusText(row.status) }}</el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column prop="reason" label="复盘说明" min-width="260" />
                  </el-table>
                  <el-empty v-else description="暂无记忆引用反馈" />
                </el-tab-pane>
                <el-tab-pane label="未关闭风险" name="risks">
                  <el-alert
                    v-if="retrospectiveSummary?.unresolvedRiskCount"
                    type="warning"
                    show-icon
                    title="存在未关闭风险：请补齐处理结论，或在审核时选择“带风险通过”并填写风险接受说明。"
                  />
                  <el-alert v-else type="success" show-icon title="当前没有未关闭风险" />
                </el-tab-pane>
              </el-tabs>
            </div>
          </div>
        </section>
      </main>

      <ArtifactSidebar
        :workflow="workflow"
        :artifacts="workflow.artifacts"
        :issues="workflow.issues"
        @refresh="runRefresh"
        @select="previewArtifact"
        @public-sync="openPublicSync"
      />
    </div>

    <ReviewDialog ref="reviewDialog" @submit="submitReview" @synced="handleArtifactGitSynced" />
    <ArtifactGitSyncDialog ref="artifactGitSyncDialog" @synced="handleArtifactGitSynced" />
    <SupplementInputDialog
      v-model="prdSupplementDialogVisible"
      v-model:text="prdClarification"
      v-model:blocks="prdSupplementBlocks"
      title="PRD 补充输入"
      :files="prdSourceFiles"
      :project-id="currentProjectId"
      notice="用于 PRD 初始生成，可直接粘贴文本、截图或上传来源文件。"
      placeholder="填写 PRD 澄清描述，例如范围边界、排除项、业务前提"
      input-class="prd-supplement-input"
      :uploading="supplementDialogBusy"
      :history="prdSupplementHistory"
      @upload-files="uploadPrdSupplementFiles"
      @save="persistPrdSupplementInput"
    />
    <SupplementInputDialog
      v-model="prdClarificationDialogVisible"
      v-model:text="prdClarificationDraft"
      v-model:blocks="prdClarificationDraftBlocks"
      title="澄清 PRD"
      document-label="当前 PRD 文档"
      :document-path="prdClarificationDocumentPath || '未生成'"
      :files="prdSourceFiles"
      :project-id="currentProjectId"
      notice="将基于现有 PRD 文档更新 analysis.md，并在文末追加澄清历史。"
      placeholder="输入本次澄清描述，例如范围边界、异常场景、排除项或已确认业务约束"
      input-class="prd-clarification-input"
      :uploading="supplementDialogBusy"
      :close-on-save="false"
      :history="prdClarificationSupplementHistory"
      @upload-files="uploadPrdSupplementFiles"
      @save="submitPrdClarification"
    />
    <SupplementInputDialog
      v-model="techDesignSupplementDialogVisible"
      v-model:text="designClarification"
      v-model:blocks="techDesignSupplementBlocks"
      title="技术方案补充输入"
      :files="techDesignSourceFiles"
      :project-id="currentProjectId"
      notice="用于补充约束、评审意见或二次修改说明；下一次技术方案生成成功后会自动清空。"
      placeholder="补充评审意见、约束或二次修改说明（可选）"
      input-class="design-clarification"
      :uploading="supplementDialogBusy"
      :history="techDesignSupplementHistory"
      @upload-files="uploadTechDesignSupplementFiles"
      @save="persistTechDesignSupplementInput"
    />
    <SupplementInputDialog
      v-model="openSpecSupplementDialogVisible"
      v-model:text="openSpecArtifactAdjustment"
      v-model:blocks="openSpecSupplementBlocks"
      title="OpenSpec 工件补充输入"
      :files="openSpecSupplementFiles"
      :project-id="currentProjectId"
      notice="用于本次 OpenSpec 工件生成或增量修订；附件需在此处显式上传，图片样式参考请使用视觉上下文。"
      placeholder="输入本次增量调整说明"
      :max-length="2000"
      input-class="openspec-adjustment-input"
      :uploading="supplementDialogBusy"
      :history="openSpecSupplementHistory"
      @upload-files="uploadOpenSpecSupplementFiles"
      @save="persistOpenSpecSupplementInput"
    />
    <DesignQuestionDialog
      ref="designQuestionDialog"
      :loading="techDesignQuestionLoading"
      :items="techDesignQuestionItems"
      :submit-label="actionButtonText('提问')"
      @open="loadTechDesignQuestionRecords"
      @progress="openRunLog"
      @delete="deleteDesignQuestion"
      @submit="runDesignQuestion"
    />
    <RunLogDrawer ref="runLogDrawer" :events="store.runEvents" :usage="selectedRunTokenUsage" />
    <TokenUsageDetailDialog ref="tokenUsageDetailDialog" :requirement-pk="workflow.id" />
    <ArtifactPreviewDialog ref="artifactPreviewDialog" />
    <ArtifactEditDialog ref="artifactEditDialog" />
    <MemoryRecallPreviewDialog
      v-model="memoryRecallDialogVisible"
      :requirement-id="workflow.requirementId"
      action-type="DESIGN_GENERATE"
      stage="TECH_DESIGN"
      :source-file-paths="pendingDesignSourceFiles"
      :clarification="pendingDesignClarification"
      run-intent="生成技术方案"
      @confirm="handleMemoryRecallConfirm"
    />
  </div>
  <el-empty v-else description="需求加载中" />
  <ArtifactVersionDiffDialog ref="openSpecVersionDiffDialog" />
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { Back, ChatLineSquare, Collection, CopyDocument, DataAnalysis, DocumentChecked, EditPen, Operation, Refresh, Tickets, View } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type {
  ActionInput,
  ArtifactRef,
  ExecutionMode,
  GitChangeSummary,
  ImplementationStep,
  OpenSpecArtifactRef,
  OpenSpecVisualContextCandidate,
  OpenSpecSummary,
  OpenSpecTaskItem,
  RequirementTokenUsageSummary,
  RequirementType,
  RunRecord,
  RunTokenUsageRun,
  PrdSourceFile,
  SupplementBlock,
  TechDesignVersion,
  TokenUsageSummary,
  WorkflowStage,
  WorkflowStatus
} from '@shared/workflow';
import {
  areAllImplementationStepsApproved,
  emptyRequirementTokenUsage,
  emptyRunTokenUsage,
  emptyTokenUsageSummary,
  ensureImplementationSteps,
  findFirstPendingImplementationStep,
  implementationStepLabels,
  implementationSteps,
  requirementTypeLabels,
  stageLabels,
  statusLabels,
  workflowStagesForWorkflow
} from '@shared/workflow';
import StageTimeline from '@/components/StageTimeline.vue';
import OpenSpecDocuments from '@/components/OpenSpecDocuments.vue';
import ReviewDialog from '@/components/ReviewDialog.vue';
import RunLogDrawer from '@/components/RunLogDrawer.vue';
import TokenUsageDetailDialog from '@/components/TokenUsageDetailDialog.vue';
import ArtifactSidebar from '@/components/ArtifactSidebar.vue';
import ArtifactPreviewDialog from '@/components/ArtifactPreviewDialog.vue';
import ArtifactEditDialog from '@/components/ArtifactEditDialog.vue';
import ArtifactVersionDiffDialog from '@/components/ArtifactVersionDiffDialog.vue';
import ArtifactGitSyncDialog from '@/components/ArtifactGitSyncDialog.vue';
import DesignQuestionDialog from '@/components/DesignQuestionDialog.vue';
import MemoryRecallPreviewDialog from '@/components/MemoryRecallPreviewDialog.vue';
import MemoryCandidateTable from '@/components/MemoryCandidateTable.vue';
import GitChangeInspector from '@/components/GitChangeInspector.vue';
import TechDesignVersionSelector from '@/components/TechDesignVersionSelector.vue';
import SupplementInputDialog from '@/components/SupplementInputDialog.vue';
import SupplementInputSummary from '@/components/SupplementInputSummary.vue';
import OpenSpecVisualContextPicker from '@/components/OpenSpecVisualContextPicker.vue';
import { useWorkflowStore } from '@/stores/workflow';
import { useSettingsStore } from '@/stores/settings';
import { useProjectStore } from '@/stores/project';
import { apiClient, type RequirementWorkspaceStateVO } from '@/api/client';
import { getApiRuntimeConfig } from '@/api/runtime';
import { findLatestStageRun } from '@/utils/run-selection';
import { buildSupplementBlocks, buildSupplementComposerValue } from '@/utils/supplement-composer';
import {
  buildTechDesignQuestionItems,
  parseTechDesignQuestionRecords,
  type TechDesignQuestionListItem,
  type TechDesignQuestionRecord
} from '@/utils/tech-design-questions';
import type {
  MemoryCandidate,
  MemoryCandidateStatus,
  MemoryRecallActionInput,
  MemoryRecallFeedback,
  MemoryRecallFeedbackFile,
  RetrospectiveEvidenceFile,
  RetrospectiveEvidenceItem,
  RetrospectiveSummary
} from '@shared/memory';

const route = useRoute();
const store = useWorkflowStore();
const settings = useSettingsStore();
const projectStore = useProjectStore();
const activeStage = ref<WorkflowStage>('PRD');
const reviewDialog = ref<InstanceType<typeof ReviewDialog>>();
const artifactGitSyncDialog = ref<InstanceType<typeof ArtifactGitSyncDialog>>();
const designQuestionDialog = ref<InstanceType<typeof DesignQuestionDialog>>();
const runLogDrawer = ref<InstanceType<typeof RunLogDrawer>>();
const tokenUsageDetailDialog = ref<InstanceType<typeof TokenUsageDetailDialog>>();
const artifactPreviewDialog = ref<InstanceType<typeof ArtifactPreviewDialog>>();
const artifactEditDialog = ref<InstanceType<typeof ArtifactEditDialog>>();
const openSpecVersionDiffDialog = ref<InstanceType<typeof ArtifactVersionDiffDialog>>();
const selectedArtifactPath = ref('');
const selectedPrdEditorPath = ref('');
const sourceText = ref('');
const prdClarification = ref('');
const prdSupplementBlocks = ref<SupplementBlock[]>([]);
const prdSupplementDialogVisible = ref(false);
const prdClarificationDialogVisible = ref(false);
const prdClarificationDraft = ref('');
const prdClarificationDraftBlocks = ref<SupplementBlock[]>([]);
const changeName = ref('');
const branchName = ref('');
const codeReviewMode = ref<'commit' | 'staged'>('commit');
const selectedAgentId = ref('codex');
const selectedExecutionMode = ref<ExecutionMode>('INTERACTIVE_TERMINAL');
const designClarification = ref('');
const techDesignSupplementBlocks = ref<SupplementBlock[]>([]);
const techDesignSupplementDialogVisible = ref(false);
const techDesignQuestionLoading = ref(false);
const techDesignQuestionRecords = ref<TechDesignQuestionRecord[]>([]);
const openSpecSummary = ref<OpenSpecSummary>();
const selectedOpenSpecDocPath = ref('');
let openSpecSummaryRequestKey = '';
let openSpecSummaryInFlight: Promise<void> | undefined;
const openSpecTechDesignVersions = ref<TechDesignVersion[]>([]);
const openSpecVersionLoading = ref(false);
const openSpecBaseVersionId = ref('');
const openSpecTargetVersionId = ref('current');
const openSpecBaseVersionManual = ref(false);
const openSpecArtifactAdjustment = ref('');
const openSpecSupplementBlocks = ref<SupplementBlock[]>([]);
const openSpecSupplementFiles = ref<PrdSourceFile[]>([]);
const openSpecSupplementDialogVisible = ref(false);
const openSpecSupplementPersisting = ref(false);
const openSpecVisualContextCandidates = ref<OpenSpecVisualContextCandidate[]>([]);
const openSpecVisualContextPaths = ref<string[]>([]);
const openSpecVisualContextLoading = ref(false);
let openSpecVersionRequestKey = '';
let openSpecVersionInFlight: Promise<void> | undefined;
let openSpecVisualContextRequestKey = '';
let openSpecVisualContextInFlight: Promise<void> | undefined;
let workspaceStatesRequestKey = '';
let workspaceStatesInFlight: Promise<void> | undefined;
const openSpecPreviewVersion = ref(0);
const activeImplementationStep = ref<ImplementationStep>('START_CHANGE');
const gitChanges = ref<GitChangeSummary>();
const workspaceStates = ref<RequirementWorkspaceStateVO[]>([]);
const actionRunning = ref(false);
const supplementInputBusy = ref(false);
const requirementTokenUsage = ref<RequirementTokenUsageSummary>(emptyRequirementTokenUsage());
const currentRunTokenUsage = ref<RunTokenUsageRun>();
const selectedRunTokenUsage = ref<RunTokenUsageRun>();
const memoryRecallDialogVisible = ref(false);
const pendingDesignAction = ref<ActionInput>();
const retrospectiveActiveTab = ref('summary');
const retrospectiveLoading = ref(false);
const retrospectiveSummary = ref<RetrospectiveSummary>();
const retrospectiveCandidates = ref<MemoryCandidate[]>([]);
const retrospectiveEvidenceItems = ref<RetrospectiveEvidenceItem[]>([]);
const retrospectiveRecallFeedback = ref<MemoryRecallFeedback[]>([]);
const retrospectiveFocus = ref('');
const retrospectiveCandidateStatusFilter = ref<'ALL' | MemoryCandidateStatus>('ALL');

const workflow = computed(() => store.current);
const currentProjectId = computed(() => projectStore.current?.id || '');
const pageBusy = computed(() => store.loading || actionRunning.value);
const supplementDialogBusy = computed(() => supplementInputBusy.value || actionRunning.value);
const realtimeStatusText = computed(() => {
  const text: Record<typeof store.realtimeStatus, string> = {
    CONNECTING: '实时连接中',
    CONNECTED: '实时已连接',
    DISCONNECTED: '实时未连接',
    ERROR: '实时异常'
  };
  return text[store.realtimeStatus];
});
const realtimeStatusType = computed(() => {
  const type: Record<typeof store.realtimeStatus, 'success' | 'info' | 'warning' | 'danger'> = {
    CONNECTING: 'warning',
    CONNECTED: 'success',
    DISCONNECTED: 'info',
    ERROR: 'danger'
  };
  return type[store.realtimeStatus];
});
const applicableStages = computed(() => workflowStagesForWorkflow(workflow.value));
const isDefectWorkflow = computed(() => workflow.value?.requirementType === 'DEFECT');
const requiresPrdApproval = computed(() => !isDefectWorkflow.value);
const implementationStepStates = computed(() => ensureImplementationSteps(workflow.value?.implementationSteps));
const currentStageRun = computed<RunRecord | undefined>(() => {
  return findLatestStageRun(workflow.value?.runs || [], activeStage.value, activeStage.value === 'IMPLEMENTATION' ? activeImplementationStep.value : undefined);
});
const prdSourceFiles = computed(() => workflow.value?.prdSourceFiles || []);
const techDesignSourceFiles = computed(() => workflow.value?.techDesignSourceFiles || []);
const prdSupplementValue = computed(() =>
  buildSupplementComposerValue(buildSupplementBlocks({ blocks: prdSupplementBlocks.value, text: prdClarification.value, files: prdSourceFiles.value }))
);
const prdClarificationDraftValue = computed(() =>
  buildSupplementComposerValue(buildSupplementBlocks({ blocks: prdClarificationDraftBlocks.value, text: prdClarificationDraft.value, files: prdSourceFiles.value }))
);
const techDesignSupplementValue = computed(() =>
  buildSupplementComposerValue(buildSupplementBlocks({ blocks: techDesignSupplementBlocks.value, text: designClarification.value, files: techDesignSourceFiles.value }))
);
const openSpecSupplementValue = computed(() =>
  buildSupplementComposerValue(buildSupplementBlocks({ blocks: openSpecSupplementBlocks.value, text: openSpecArtifactAdjustment.value }))
);
const prdApproved = computed(() => workflow.value?.stages.PRD.status === 'APPROVED');
const techDesignApproved = computed(() => workflow.value?.stages.TECH_DESIGN.status === 'APPROVED');
const codeReviewApproved = computed(() => workflow.value?.stages.CODE_REVIEW.status === 'APPROVED');
const workspaceBlockers = computed(() => {
  const currentUserId = getApiRuntimeConfig().userId;
  return workspaceStates.value.filter((state) => {
    if (String(state.userId) === String(currentUserId)) {
      return false;
    }
    return ['EDITING', 'DIRTY', 'SYNCING'].includes(state.status);
  });
});
const workspaceBlockerText = computed(() => {
  if (!workspaceBlockers.value.length) {
    return '';
  }
  const names = [...new Set(workspaceBlockers.value.map((state) => state.userDisplayName || `用户 ${state.userId}`))].join('、');
  const total = workspaceBlockers.value.reduce((sum, state) => sum + (state.dirtyFileCount || 0), 0);
  return `${names} 正在编辑当前需求，本地未同步文件 ${total} 个。请等待对方公开同步或清理后再操作。`;
});
const openSpecDocuments = computed(() => [...(openSpecSummary.value?.artifacts || []), ...(openSpecSummary.value?.specs || [])]);
const openSpecReadableTechDesignVersions = computed(() => openSpecTechDesignVersions.value.filter((version) => version.readable));
const selectedOpenSpecTargetVersion = computed(() => openSpecTechDesignVersions.value.find((version) => version.id === openSpecTargetVersionId.value));
const selectedOpenSpecBaseVersion = computed(() => openSpecTechDesignVersions.value.find((version) => version.id === openSpecBaseVersionId.value));
const openSpecBaseVersionText = computed(() => versionDisplayText(selectedOpenSpecBaseVersion.value) || '暂无可用基线版本');
const implementationStepItems = computed(() =>
  implementationSteps.map((step) => ({
    ...implementationStepStates.value[step],
    label: implementationStepLabels[step]
  }))
);
const openSpecTaskPercentage = computed(() => {
  const total = openSpecSummary.value?.tasks.total || 0;
  if (!total) {
    return 0;
  }
  return Math.round(((openSpecSummary.value?.tasks.completed || 0) / total) * 100);
});
const openSpecPendingTaskCount = computed(() => Math.max(0, (openSpecSummary.value?.tasks.total || 0) - (openSpecSummary.value?.tasks.completed || 0)));
const canArchiveOpenSpec = computed(() => Boolean(workflow.value?.stages.CODE_REVIEW.status === 'APPROVED' && !openSpecSummary.value?.archived));
const openSpecChangeExists = computed(() => Boolean(openSpecSummary.value?.exists));
const openSpecArtifactsComplete = computed(() => {
  const summary = openSpecSummary.value;
  if (!summary?.exists || summary.archived) {
    return false;
  }
  const existingArtifactTypes = new Set(summary.artifacts.filter((artifact) => artifact.exists).map((artifact) => artifact.type));
  return existingArtifactTypes.has('proposal') && existingArtifactTypes.has('design') && existingArtifactTypes.has('tasks') && summary.specs.some((spec) => spec.exists);
});
const openSpecArtifactActionText = computed(() => (openSpecArtifactsComplete.value ? '更新 OpenSpec 工件' : '生成 OpenSpec 工件'));
const canRunOpenSpecNewChange = computed(() => Boolean(techDesignApproved.value && !openSpecChangeExists.value));
const canRunOpenSpecArtifacts = computed(() => Boolean(implementationStepStates.value.START_CHANGE.status === 'APPROVED' && techDesignApproved.value));
const canRunOpenSpecApply = computed(() => implementationStepStates.value.ARTIFACT_REVIEW.status === 'APPROVED');
const canRunDesign = computed(() => (requiresPrdApproval.value ? Boolean(prdApproved.value && prdDesignSourcePath.value) : true));
const canInspectChanges = computed(() => implementationStepStates.value.APPLY.status === 'APPROVED');
const canReviewImplementationStage = computed(() => areAllImplementationStepsApproved(workflow.value?.implementationSteps));
const canReviewRetrospectiveStage = computed(() => Boolean(retrospectiveSummary.value?.readyForReview));
const retrospectiveReviewTitle = computed(() => {
  if (activeStage.value !== 'RETROSPECTIVE') {
    return '提交审核';
  }
  if (canReviewRetrospectiveStage.value) {
    return '复盘报告、候选经验和风险状态已满足审核条件';
  }
  return '需要先生成复盘报告，并处理完待确认候选经验和未关闭风险';
});
const openIssueCount = computed(() => workflow.value?.issues.filter((item) => item.status === 'OPEN').length || 0);
const implementationOpenSpecPath = computed(() => openSpecSummary.value?.rootPath || stageArtifactPath('IMPLEMENTATION') || '未关联');
const implementationArchiveStatus = computed(() => (openSpecSummary.value?.archived ? '已归档' : '进行中'));
const codeReviewArtifactPath = computed(() => stageArtifactPath('CODE_REVIEW') || '');
const requirementTypeText = computed(() => requirementTypeLabels[workflow.value?.requirementType || 'REQUIREMENT']);
const requirementTokenSummary = computed(() => requirementTokenUsage.value?.summary || emptyTokenUsageSummary());
const currentRunUsageSummary = computed<TokenUsageSummary>(() => currentRunTokenUsage.value?.summary || emptyTokenUsageSummary(currentStageRun.value?.id));
const currentRunTokenText = computed(() => {
  const summary = currentRunUsageSummary.value;
  return summary.detailCount ? formatTokenCount(summary.totalTokens) : '0';
});
const junitArtifact = computed(
  () =>
    workflow.value?.artifacts.find((artifact) => artifact.stage === 'IMPLEMENTATION' && artifact.exists && artifact.kind !== 'directory' && artifact.path.includes('/junit/'))
);
const junitArtifactPath = computed(() => junitArtifact.value?.path || '');
const prdArtifactItems = computed(() => {
  if (!workflow.value || !requiresPrdApproval.value) {
    return [];
  }
  return workflow.value.artifacts
    .filter((artifact) => artifact.stage === 'PRD' && artifact.kind !== 'directory')
    .sort((left, right) => Number(right.exists) - Number(left.exists) || left.path.localeCompare(right.path));
});
const prdArtifactSummaryText = computed(() => {
  const total = prdArtifactItems.value.length;
  if (!total) {
    return '暂无产物';
  }
  const generated = prdArtifactItems.value.filter((artifact) => artifact.exists).length;
  return generated === total ? `${total} 个产物` : `${generated}/${total} 已生成`;
});
const officialPrdDocumentPath = computed(() => {
  if (!workflow.value || !requiresPrdApproval.value) {
    return '';
  }
  const selected = workflow.value.artifacts.find((artifact) => artifact.path === selectedArtifactPath.value);
  if (selected?.stage === 'PRD' && selected.exists && selected.kind !== 'directory') {
    return selected.path;
  }
  return (
    workflow.value.artifacts.find((artifact) => artifact.stage === 'PRD' && artifact.exists && artifact.kind !== 'directory')?.path ||
    workflow.value.stages.PRD.artifactPath ||
    ''
  );
});
const prdClarificationDocumentPath = computed(() => {
  if (!workflow.value || !requiresPrdApproval.value) {
    return '';
  }
  return officialPrdDocumentPath.value;
});
const canClarifyPrd = computed(() => Boolean(requiresPrdApproval.value && prdClarificationDocumentPath.value));
const prdDesignSourcePath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  if (!requiresPrdApproval.value) {
    return '';
  }
  return officialPrdDocumentPath.value;
});
const openSpecPrdDocumentPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  if (!requiresPrdApproval.value) {
    return '';
  }
  const selected = workflow.value.artifacts.find((artifact) => artifact.path === selectedArtifactPath.value);
  if (selected?.stage === 'PRD' && selected.exists && selected.kind !== 'directory') {
    return selected.path;
  }
  return officialPrdDocumentPath.value;
});
const technicalDesignEditorPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  const artifactPath = officialTechnicalDesignArtifactPath();
  return artifactPath || defaultTechnicalDesignDocumentPath(workflow.value.requirementId);
});
const retrospectiveEditorPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  return retrospectiveSummary.value?.summaryPath || workflow.value.stages.RETROSPECTIVE.artifactPath || `docs/${workflow.value.requirementId}/retrospective/summary.md`;
});
const retrospectiveArtifactItems = computed(() => {
  if (!workflow.value) {
    return [];
  }
  return workflow.value.artifacts
    .filter((artifact) => artifact.stage === 'RETROSPECTIVE' && artifact.exists && artifact.kind !== 'directory')
    .sort((left, right) => left.path.localeCompare(right.path));
});
const retrospectiveCandidateStatusOptions: Array<{ label: string; value: 'ALL' | MemoryCandidateStatus }> = [
  { label: '全部', value: 'ALL' },
  { label: '待确认', value: 'PENDING_CONFIRM' },
  { label: '待验证', value: 'PENDING_VERIFY' },
  { label: '仅本需求', value: 'LOCAL_ONLY' },
  { label: '已沉淀', value: 'CONFIRMED' },
  { label: '已忽略', value: 'IGNORED' }
];
const retrospectiveCandidateStats = computed(() => {
  const stats: Record<'ALL' | MemoryCandidateStatus, number> = {
    ALL: retrospectiveCandidates.value.length,
    PENDING_CONFIRM: 0,
    PENDING_VERIFY: 0,
    LOCAL_ONLY: 0,
    IGNORED: 0,
    CONFIRMED: 0
  };
  for (const candidate of retrospectiveCandidates.value) {
    stats[candidate.status] += 1;
  }
  return stats;
});
const filteredRetrospectiveCandidates = computed(() => {
  if (retrospectiveCandidateStatusFilter.value === 'ALL') {
    return retrospectiveCandidates.value;
  }
  return retrospectiveCandidates.value.filter((item) => item.status === retrospectiveCandidateStatusFilter.value);
});
const openSpecTechnicalDesignDocumentPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  return officialTechnicalDesignArtifactPath();
});
const legacyTechDesignQuestionPath = computed(() => {
  if (!workflow.value) {
    return '';
  }
  return `docs/${workflow.value.requirementId}/technical-design/questions.md`;
});
const techDesignQuestionArtifacts = computed(() => {
  if (!workflow.value) {
    return [];
  }
  const requirementId = workflow.value.requirementId;
  const legacyPath = legacyTechDesignQuestionPath.value;
  const questionPrefix = `docs/${requirementId}/technical-design/questions/`;
  return workflow.value.artifacts
    .filter(
      (artifact) =>
        artifact.exists &&
        artifact.kind !== 'directory' &&
        (artifact.id === 'technical-design-questions' || artifact.path === legacyPath || artifact.path.replace(/\\/g, '/').startsWith(questionPrefix))
    )
    .sort((left, right) => left.path.localeCompare(right.path));
});
const techDesignQuestionReadPaths = computed(() => {
  if (!workflow.value) {
    return [];
  }
  const paths = new Set(techDesignQuestionArtifacts.value.map((artifact) => artifact.path));
  for (const run of workflow.value.runs || []) {
    if (run.actionType !== 'DESIGN_QUESTION') {
      continue;
    }
    const outputPath = normalizeTechDesignQuestionPath(run.params?.outputPath);
    if (isTechDesignQuestionPath(outputPath)) {
      paths.add(outputPath);
    }
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
});
const techDesignQuestionContextPaths = computed(() => {
  const paths = new Set(techDesignQuestionArtifacts.value.map((artifact) => artifact.path));
  for (const record of techDesignQuestionRecords.value) {
    const sourcePath = normalizeTechDesignQuestionPath(record.sourcePath);
    if (isTechDesignQuestionPath(sourcePath)) {
      paths.add(sourcePath);
    }
  }
  return [...paths].sort((left, right) => left.localeCompare(right));
});
const consumedTechDesignQuestionPathSet = computed(() => {
  return new Set((workflow.value?.techDesignConsumedQuestionPaths || []).map((path) => normalizeTechDesignQuestionPath(path)).filter(Boolean));
});
const pendingTechDesignQuestionContextPaths = computed(() => {
  return techDesignQuestionContextPaths.value.filter((path) => !consumedTechDesignQuestionPathSet.value.has(normalizeTechDesignQuestionPath(path)));
});
const pendingTechDesignQuestionContextText = computed(() => {
  if (!pendingTechDesignQuestionContextPaths.value.length) {
    return '';
  }
  if (pendingTechDesignQuestionContextPaths.value.length === 1) {
    return pendingTechDesignQuestionContextPaths.value[0];
  }
  return `${pendingTechDesignQuestionContextPaths.value.length} 条新增答疑记录`;
});
const techDesignGenerationSourcePaths = computed(() => {
  const paths = [...pendingTechDesignQuestionContextPaths.value, ...techDesignSupplementValue.value.sourceFiles].filter(
    (item): item is string => Boolean(item)
  );
  return [...new Set(paths)];
});
const techDesignQuestionItems = computed(() => buildTechDesignQuestionItems(techDesignQuestionRecords.value, workflow.value?.runs || []));
const techDesignQuestionButtonText = computed(() => (techDesignQuestionItems.value.length ? `技术方案答疑 ${techDesignQuestionItems.value.length}` : '技术方案答疑'));
const stageHint = computed(() => {
  const hints: Record<WorkflowStage, string> = {
    PRD: '产品生成并二次编辑 PRD，审核通过后进入技术方案。',
    TECH_DESIGN: '架构师生成技术方案，审核通过后解锁实施。',
    IMPLEMENTATION: `实施验证分步骤推进：${implementationStepLabels[activeImplementationStep.value]}。`,
    CODE_REVIEW: '按分支生成评审报告，阻断问题可打回实施阶段。',
    RETROSPECTIVE: '汇总交付证据，复盘沟通与记忆引用效果，确认是否沉淀项目经验。'
  };
  return hints[activeStage.value];
});
const manualCopyMode = computed(() => selectedExecutionMode.value === 'MANUAL_COPY');
const pendingDesignSourceFiles = computed(() => {
  const sourceFiles = pendingDesignAction.value?.params?.sourceFiles;
  return Array.isArray(sourceFiles)
    ? sourceFiles.map((item) => String(item).trim()).filter(Boolean)
    : techDesignGenerationSourcePaths.value;
});
const pendingDesignClarification = computed(() => {
  const clarification = pendingDesignAction.value?.params?.clarification;
  return typeof clarification === 'string' ? clarification : designClarification.value.trim();
});
const prdSupplementHistory = computed(() => supplementHistoryForActions(['PRD_ANALYZE']));
const prdClarificationSupplementHistory = computed(() => supplementHistoryForActions(['PRD_CLARIFY']));
const techDesignSupplementHistory = computed(() => supplementHistoryForActions(['DESIGN_GENERATE']));
const openSpecSupplementHistory = computed(() => supplementHistoryForActions(['OPENSPEC_FF']));

function supplementHistoryForActions(actionTypes: ActionInput['actionType'][]) {
  const allowed = new Set(actionTypes);
  return (workflow.value?.runs || [])
    .filter((run) => allowed.has(run.actionType) && ['SUCCEEDED', 'COMPLETED'].includes(run.status))
    .map((run) => {
      const path = typeof run.params?.supplementInputPath === 'string' ? run.params.supplementInputPath.trim() : '';
      return path
        ? {
            id: run.id,
            actionType: run.actionType,
            status: run.status,
            path,
            createdAt: run.finishedAt || run.startedAt
          }
        : undefined;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => Date.parse(right.createdAt || '') - Date.parse(left.createdAt || ''));
}

function stageArtifactPath(stage: WorkflowStage) {
  if (selectedArtifactPath.value) {
    const selected = workflow.value?.artifacts.find((artifact) => artifact.path === selectedArtifactPath.value);
    if (selected?.stage === stage && selected.exists && selected.kind !== 'directory') {
      return selected.path;
    }
  }
  return workflow.value?.artifacts.find((artifact) => artifact.stage === stage && artifact.exists && artifact.kind !== 'directory')?.path;
}

function defaultTechnicalDesignDocumentPath(requirementId: string) {
  return `docs/${requirementId}/technical-design/design_review.md`;
}

function isTechnicalDesignSourcePath(filePath: string) {
  return filePath.replace(/\\/g, '/').includes('/technical-design/file/');
}

function normalizeTechDesignQuestionPath(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\\/g, '/') : '';
}

function isTechDesignQuestionPath(filePath: string) {
  if (!workflow.value || !filePath) {
    return false;
  }
  const requirementId = workflow.value.requirementId;
  const legacyPath = `docs/${requirementId}/technical-design/questions.md`;
  const questionPrefix = `docs/${requirementId}/technical-design/questions/`;
  return filePath === legacyPath || (filePath.startsWith(questionPrefix) && /\.md$/i.test(filePath));
}

function officialTechnicalDesignArtifactPath() {
  if (!workflow.value) {
    return '';
  }
  const defaultPath = defaultTechnicalDesignDocumentPath(workflow.value.requirementId);
  const officialArtifact = workflow.value.artifacts.find(
    (artifact) => artifact.exists && artifact.kind !== 'directory' && (artifact.id === 'technical-design' || artifact.path === defaultPath)
  );
  if (officialArtifact) {
    return officialArtifact.path;
  }
  const artifactPath = workflow.value.stages.TECH_DESIGN.artifactPath?.trim();
  if (artifactPath && !isTechnicalDesignSourcePath(artifactPath)) {
    return artifactPath;
  }
  return '';
}

async function reload(options: { preferCurrent?: boolean } = {}) {
  if (typeof route.params.requirementId === 'string') {
    const requirementId = route.params.requirementId;
    const alreadyLoaded = workflow.value?.requirementId === requirementId;
    if (!options.preferCurrent || !alreadyLoaded) {
      await store.loadRequirement(requirementId);
    }
    store.streamWorkflowEvents();
  }
}

async function loadWorkspaceStates() {
  if (!workflow.value?.id) {
    workspaceStates.value = [];
    return;
  }
  const workflowId = workflow.value.id;
  const key = String(workflowId);
  if (workspaceStatesInFlight && workspaceStatesRequestKey === key) {
    await workspaceStatesInFlight;
    return;
  }
  workspaceStatesRequestKey = key;
  workspaceStatesInFlight = (async () => {
    try {
      workspaceStates.value = await apiClient.listRequirementWorkspaceStates(workflowId);
    } catch {
      workspaceStates.value = [];
    } finally {
      if (workspaceStatesRequestKey === key) {
        workspaceStatesInFlight = undefined;
      }
    }
  })();
  await workspaceStatesInFlight;
}

async function loadRequirementTokenUsage() {
  if (!workflow.value?.id) {
    requirementTokenUsage.value = emptyRequirementTokenUsage();
    return;
  }
  try {
    requirementTokenUsage.value = await apiClient.getRequirementTokenUsageSummary(workflow.value.id);
  } catch {
    requirementTokenUsage.value = emptyRequirementTokenUsage(workflow.value.id);
  }
}

async function loadRunTokenUsage(runId: string): Promise<RunTokenUsageRun> {
  if (!workflow.value) {
    return emptyRunTokenUsage(runId);
  }
  const run = workflow.value.runs.find((item) => item.id === runId);
  const usageRunId = run?.centerRunId || runId;
  try {
    return await apiClient.getRunTokenUsages(workflow.value.requirementId, usageRunId);
  } catch {
    return emptyRunTokenUsage(usageRunId);
  }
}

async function loadOpenSpecSummary() {
  if (!workflow.value) {
    return;
  }
  const requirementId = workflow.value.requirementId;
  const currentChangeName = changeName.value || `req-${requirementId}`;
  const key = `${requirementId}:${currentChangeName}`;
  if (openSpecSummaryInFlight && openSpecSummaryRequestKey === key) {
    await openSpecSummaryInFlight;
    return;
  }
  openSpecSummaryRequestKey = key;
  openSpecSummaryInFlight = (async () => {
    const summary = await apiClient.getOpenSpecSummary(requirementId, currentChangeName);
    openSpecSummary.value = summary;
    const selectedStillExists = openSpecDocuments.value.some((doc) => doc.path === selectedOpenSpecDocPath.value && doc.exists);
    if (!selectedStillExists) {
      selectedOpenSpecDocPath.value = openSpecDocuments.value.find((doc) => doc.exists)?.path || '';
    }
  })().finally(() => {
    if (openSpecSummaryRequestKey === key) {
      openSpecSummaryInFlight = undefined;
    }
  });
  await openSpecSummaryInFlight;
}

async function loadOpenSpecVisualContextCandidates() {
  if (!workflow.value) {
    openSpecVisualContextCandidates.value = [];
    return;
  }
  const requirementId = workflow.value.requirementId;
  if (openSpecVisualContextInFlight && openSpecVisualContextRequestKey === requirementId) {
    await openSpecVisualContextInFlight;
    return;
  }
  openSpecVisualContextRequestKey = requirementId;
  openSpecVisualContextLoading.value = true;
  openSpecVisualContextInFlight = apiClient
    .listOpenSpecVisualContextCandidates(requirementId)
    .then((result) => {
      openSpecVisualContextCandidates.value = result.candidates || [];
      const candidatePaths = new Set(openSpecVisualContextCandidates.value.map((item) => item.path));
      openSpecVisualContextPaths.value = openSpecVisualContextPaths.value.filter((item) => candidatePaths.has(item));
    })
    .catch((error: any) => {
      openSpecVisualContextCandidates.value = [];
      ElMessage.error(error.message || '视觉上下文候选加载失败');
    })
    .finally(() => {
      if (openSpecVisualContextRequestKey === requirementId) {
        openSpecVisualContextInFlight = undefined;
        openSpecVisualContextLoading.value = false;
      }
    });
  await openSpecVisualContextInFlight;
}

function versionDisplayText(version?: TechDesignVersion) {
  if (!version) {
    return '';
  }
  const parts = [version.label];
  if (version.versionNo && !version.label.includes(`v${version.versionNo}`)) {
    parts.push(`v${version.versionNo}`);
  }
  if (version.commitSha) {
    parts.push(version.commitSha.slice(0, 8));
  }
  return parts.filter(Boolean).join(' · ');
}

function latestOpenSpecTargetVersionId() {
  const runs = [...(workflow.value?.runs || [])]
    .filter((run) => run.actionType === 'OPENSPEC_FF' && !['FAILED', 'CANCELLED'].includes(run.status))
    .sort((left, right) => Date.parse(right.finishedAt || right.startedAt) - Date.parse(left.finishedAt || left.startedAt));
  return runs.map((run) => run.openSpecArtifactInputSnapshot?.targetTechDesignVersionId || '').find(Boolean) || '';
}

function firstReadableOpenSpecVersion(predicate: (version: TechDesignVersion) => boolean) {
  return openSpecReadableTechDesignVersions.value.find(predicate)?.id || '';
}

function autoOpenSpecBaseVersionId() {
  const targetVersionId = openSpecTargetVersionId.value;
  const latestTargetVersionId = latestOpenSpecTargetVersionId();
  return (
    firstReadableOpenSpecVersion((version) => version.id === latestTargetVersionId && version.id !== targetVersionId) ||
    firstReadableOpenSpecVersion((version) => version.source === 'DRAFT_SNAPSHOT' && version.id !== targetVersionId) ||
    firstReadableOpenSpecVersion((version) => version.source === 'PUBLISHED' && version.id !== targetVersionId) ||
    firstReadableOpenSpecVersion((version) => version.id !== targetVersionId)
  );
}

function applyAutoOpenSpecBaseVersion() {
  openSpecBaseVersionId.value = autoOpenSpecBaseVersionId();
}

function selectDefaultOpenSpecVersions() {
  const readable = openSpecReadableTechDesignVersions.value;
  if (!readable.length) {
    openSpecBaseVersionId.value = '';
    openSpecTargetVersionId.value = '';
    return;
  }

  if (!readable.some((version) => version.id === openSpecTargetVersionId.value)) {
    openSpecTargetVersionId.value = firstReadableOpenSpecVersion((version) => version.id === 'current') || readable[0].id;
  }

  if (!openSpecBaseVersionManual.value) {
    applyAutoOpenSpecBaseVersion();
    return;
  }
  if (!readable.some((version) => version.id === openSpecBaseVersionId.value)) {
    openSpecBaseVersionManual.value = false;
    applyAutoOpenSpecBaseVersion();
  }
}

function enableManualOpenSpecBaseVersion() {
  openSpecBaseVersionManual.value = true;
}

function restoreAutoOpenSpecBaseVersion() {
  openSpecBaseVersionManual.value = false;
  applyAutoOpenSpecBaseVersion();
}

async function loadOpenSpecTechDesignVersions(options: { selectDefaults?: boolean } = {}) {
  const selectDefaults = options.selectDefaults !== false;
  if (!workflow.value) {
    openSpecTechDesignVersions.value = [];
    openSpecBaseVersionId.value = '';
    openSpecTargetVersionId.value = '';
    return;
  }
  const requirementId = workflow.value.requirementId;
  if (openSpecVersionInFlight && openSpecVersionRequestKey === requirementId) {
    await openSpecVersionInFlight;
    return;
  }
  openSpecVersionRequestKey = requirementId;
  openSpecVersionLoading.value = true;
  openSpecVersionInFlight = (async () => {
    const result = await apiClient.listTechDesignVersions(requirementId);
    openSpecTechDesignVersions.value = result.versions || [];
    if (selectDefaults) {
      selectDefaultOpenSpecVersions();
    }
  })()
    .catch((error: any) => {
      openSpecTechDesignVersions.value = [];
      openSpecBaseVersionId.value = '';
      openSpecTargetVersionId.value = '';
      ElMessage.error(error.message || '技术方案版本加载失败');
    })
    .finally(() => {
      if (openSpecVersionRequestKey === requirementId) {
        openSpecVersionInFlight = undefined;
        openSpecVersionLoading.value = false;
      }
    });
  await openSpecVersionInFlight;
}

function openOpenSpecVersionDiff() {
  if (!workflow.value) {
    return;
  }
  if (openSpecReadableTechDesignVersions.value.length < 2) {
    ElMessage.warning('至少需要两个可读技术方案版本才能对比');
    return;
  }
  openSpecVersionDiffDialog.value?.open(workflow.value.requirementId, openSpecTechDesignVersions.value, openSpecTargetVersionId.value || 'current');
}

async function loadRetrospective() {
  if (!workflow.value) {
    retrospectiveSummary.value = undefined;
    retrospectiveCandidates.value = [];
    retrospectiveEvidenceItems.value = [];
    retrospectiveRecallFeedback.value = [];
    return;
  }
  retrospectiveLoading.value = true;
  try {
    const requirementId = workflow.value.requirementId;
    const summary = await apiClient.getRequirementRetrospective(requirementId);
    retrospectiveSummary.value = summary;
    const candidates = await apiClient.listMemoryCandidates({
      projectId: currentProjectId.value || undefined,
      requirementId,
      pageSize: 200
    });
    retrospectiveCandidates.value = candidates.items.filter((item) => item.sourceType === 'RETROSPECTIVE');
    retrospectiveEvidenceItems.value = [];
    if (summary.evidencePath) {
      try {
        const artifact = await apiClient.readArtifact(summary.evidencePath, currentProjectId.value);
        const parsed = JSON.parse(artifact.content) as RetrospectiveEvidenceFile;
        retrospectiveEvidenceItems.value = Array.isArray(parsed.items) ? parsed.items : [];
      } catch {
        retrospectiveEvidenceItems.value = [];
      }
    }
    retrospectiveRecallFeedback.value = [];
    if (summary.recallFeedbackPath) {
      try {
        const artifact = await apiClient.readArtifact(summary.recallFeedbackPath, currentProjectId.value);
        const parsed = JSON.parse(artifact.content) as MemoryRecallFeedbackFile;
        retrospectiveRecallFeedback.value = Array.isArray(parsed.items) ? parsed.items : [];
      } catch {
        retrospectiveRecallFeedback.value = [];
      }
    }
  } catch (error: any) {
    retrospectiveSummary.value = undefined;
    retrospectiveCandidates.value = [];
    retrospectiveEvidenceItems.value = [];
    retrospectiveRecallFeedback.value = [];
    ElMessage.error(error.message || '读取交付复盘失败');
  } finally {
    retrospectiveLoading.value = false;
  }
}

async function reloadRetrospectiveArtifacts() {
  await reload();
  await loadRetrospective();
}

function previewArtifact(artifact: ArtifactRef) {
  artifactPreviewDialog.value?.open(artifact, currentProjectId.value, workflow.value.id || '');
}

function artifactForPath(stage: WorkflowStage, label: string, artifactPath: string): ArtifactRef {
  const existing = workflow.value?.artifacts.find((artifact) => artifact.path === artifactPath);
  if (existing) {
    return existing;
  }
  const openSpecDocument = openSpecDocuments.value.find((artifact) => artifact.path === artifactPath);
  return {
    id: `${stage}-${artifactPath}`,
    stage,
    label: openSpecDocument?.label || label,
    path: artifactPath,
    kind: 'markdown',
    exists: Boolean(openSpecDocument?.exists || artifactPath)
  };
}

function previewArtifactPath(stage: WorkflowStage, label: string, artifactPath: string) {
  if (!artifactPath) {
    ElMessage.warning('尚未关联产物');
    return;
  }
  previewArtifact(artifactForPath(stage, label, artifactPath));
}

function previewOpenSpecDocument(doc: OpenSpecArtifactRef) {
  selectedOpenSpecDocPath.value = doc.path;
  previewArtifactPath('IMPLEMENTATION', doc.label, doc.path);
}

function openArtifactEditor(title: string, artifactPath: string, onSaved: () => void | Promise<void> = reload) {
  if (!artifactPath) {
    ElMessage.warning('尚未关联产物');
    return;
  }
  artifactEditDialog.value?.open({
    title,
    artifactPath,
    projectId: currentProjectId.value,
    onSaved
  });
}

function editOpenSpecDocument(doc: OpenSpecArtifactRef) {
  selectedOpenSpecDocPath.value = doc.path;
  openArtifactEditor(doc.label || '文档内容', doc.path, handleOpenSpecDocumentSaved);
}

async function handleOpenSpecDocumentSaved() {
  await reload();
  openSpecPreviewVersion.value += 1;
}

function selectPrdArtifactForEdit(artifact: ArtifactRef) {
  if (!artifact.exists) {
    ElMessage.warning('PRD 产物尚未生成');
    return;
  }
  selectedPrdEditorPath.value = artifact.path;
  openArtifactEditor('PRD 文档', artifact.path);
}

function artifactVersionText(artifact: ArtifactRef): string {
  const segments: string[] = [];
  if (artifact.currentVersionNo) {
    segments.push(`v${artifact.currentVersionNo}`);
  }
  if (artifact.versionCount) {
    segments.push(`${artifact.versionCount} 个版本`);
  }
  if (artifact.createdBy) {
    segments.push(`创建人 ${artifact.createdBy}`);
  }
  if (artifact.sourceRunId) {
    segments.push(`run ${artifact.sourceRunId}`);
  }
  return segments.join(' · ');
}

async function loadTechDesignQuestionRecords() {
  const paths = techDesignQuestionReadPaths.value;
  if (!paths.length) {
    techDesignQuestionRecords.value = [];
    return;
  }
  techDesignQuestionLoading.value = true;
  try {
    const records: TechDesignQuestionRecord[] = [];
    for (const path of paths) {
      try {
        const result = await apiClient.readArtifact(path, currentProjectId.value);
        records.push(...parseTechDesignQuestionRecords(result.content, path));
      } catch (error) {
        console.warn('读取技术方案答疑记录失败:', path, error);
      }
    }
    techDesignQuestionRecords.value = records;
  } catch (error) {
    console.error('读取技术方案答疑记录失败:', error);
    techDesignQuestionRecords.value = [];
  } finally {
    techDesignQuestionLoading.value = false;
  }
}

function openDesignQuestionDialog() {
  designQuestionDialog.value?.open();
}

async function runRefresh() {
  actionRunning.value = true;
  try {
    const result = await store.runAction({ actionType: 'REFRESH_ARTIFACTS' });
    if (result?.run?.id) {
      await openRunLog(result.run.id);
    }
    await loadOpenSpecSummary();
    ElMessage.success('产物索引已刷新');
  } finally {
    actionRunning.value = false;
  }
}

async function persistPrdSupplementInput() {
  if (!workflow.value) {
    return;
  }
  supplementInputBusy.value = true;
  try {
    await store.updateSupplementInputs({
      prdClarification: prdSupplementValue.value.markdown,
      prdSupplementBlocks: prdSupplementValue.value.blocks
    });
  } catch (error: any) {
    ElMessage.error(error.message || '保存 PRD 补充输入失败');
  } finally {
    supplementInputBusy.value = false;
  }
}

async function persistTechDesignSupplementInput() {
  if (!workflow.value) {
    return;
  }
  supplementInputBusy.value = true;
  try {
    await store.updateSupplementInputs({
      techDesignClarification: techDesignSupplementValue.value.markdown,
      techDesignSupplementBlocks: techDesignSupplementValue.value.blocks
    });
  } catch (error: any) {
    ElMessage.error(error.message || '保存技术方案补充输入失败');
  } finally {
    supplementInputBusy.value = false;
  }
}

async function persistOpenSpecSupplementInput() {
  if (!workflow.value) {
    return;
  }
  supplementInputBusy.value = true;
  openSpecSupplementPersisting.value = true;
  try {
    await store.updateSupplementInputs({
      openSpecArtifactAdjustment: openSpecSupplementValue.value.markdown,
      openSpecSupplementBlocks: openSpecSupplementValue.value.blocks
    });
  } catch (error: any) {
    ElMessage.error(error.message || '保存 OpenSpec 工件补充输入失败');
  } finally {
    openSpecSupplementPersisting.value = false;
    supplementInputBusy.value = false;
  }
}

function uniqueVisualContextPaths(paths: string[]) {
  return [...new Set(paths.map((item) => item.trim()).filter(Boolean))];
}

async function handleOpenSpecVisualContextSelection(paths: string[]) {
  const current = workflow.value;
  if (!current) {
    return;
  }
  const previous = [...openSpecVisualContextPaths.value];
  const next = uniqueVisualContextPaths(paths);
  openSpecVisualContextPaths.value = next;
  try {
    const updated = await apiClient.updateSupplementInputs(current.requirementId, {
      openSpecVisualContextPaths: next
    });
    const savedPaths = uniqueVisualContextPaths(updated.openSpecVisualContextPaths || next);
    openSpecVisualContextPaths.value = savedPaths;
    if (store.current?.requirementId === current.requirementId) {
      store.current.openSpecVisualContextPaths = savedPaths;
    }
    const requirementItem = store.requirements.find((item) => item.requirementId === current.requirementId);
    if (requirementItem) {
      requirementItem.openSpecVisualContextPaths = savedPaths;
    }
  } catch (error: any) {
    openSpecVisualContextPaths.value = previous;
    ElMessage.error(error.message || '保存视觉上下文选择失败');
  }
}

async function runPrd() {
  if (!requiresPrdApproval.value) {
    ElMessage.warning('缺陷类型不需要 PRD 分析');
    return;
  }
  const textSources = sourceText.value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const supplement = prdSupplementValue.value;
  await runOrCopyAction({
    actionType: 'PRD_ANALYZE',
    params: {
      ...agentActionParams(),
      description: supplement.markdown,
      supplementBlocks: supplement.blocks,
      sources: [...new Set([...textSources, ...supplement.sourceFiles])]
    }
  });
}

function openPrdClarificationDialog() {
  if (!requiresPrdApproval.value) {
    ElMessage.warning('缺陷类型不需要 PRD 澄清');
    return;
  }
  if (!canClarifyPrd.value) {
    ElMessage.warning('请先生成 PRD 文档');
    return;
  }
  prdClarificationDraft.value = '';
  prdClarificationDraftBlocks.value = [];
  prdClarificationDialogVisible.value = true;
}

async function submitPrdClarification() {
  if (!workflow.value) {
    return;
  }
  const supplement = prdClarificationDraftValue.value;
  const description = supplement.markdown.trim();
  if (!description) {
    ElMessage.warning('请输入 PRD 澄清描述');
    return;
  }
  if (!canClarifyPrd.value) {
    ElMessage.warning('请先生成 PRD 文档');
    return;
  }
  if (workflow.value.stages.PRD.status === 'APPROVED') {
    try {
      await ElMessageBox.confirm('澄清会更新 PRD 文档，并将 PRD 回到待审核状态；下游产物会保留供你判断是否复用。是否继续？', '确认澄清 PRD', {
        type: 'warning'
      });
    } catch {
      return;
    }
  }
  try {
    await store.updateSupplementInputs({
      prdClarificationBlocks: supplement.blocks
    });
  } catch (error: any) {
    ElMessage.error(error.message || '保存 PRD 澄清补充输入失败');
    return;
  }
  await runOrCopyAction({
    actionType: 'PRD_CLARIFY',
    params: {
      ...agentActionParams(),
      description,
      supplementBlocks: supplement.blocks,
      sources: supplement.sourceFiles
    }
  }, async (run) => {
    if (run && !['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
      return;
    }
    prdClarificationDialogVisible.value = false;
    prdClarificationDraft.value = '';
    prdClarificationDraftBlocks.value = [];
    await reload();
  });
}

async function uploadPrdSupplementFiles(files: File[]) {
  if (!files.length) {
    return;
  }
  if (!(await ensureDeliveryReady('上传 PRD 来源文件', { allowDirty: true, skipRepositoryChecks: true }))) {
    return;
  }
  supplementInputBusy.value = true;
  try {
    await store.uploadPrdFiles(files);
    await loadOpenSpecVisualContextCandidates();
    ElMessage.success('PRD 来源文件已上传');
  } catch (error: any) {
    ElMessage.error(error.message || 'PRD 来源文件上传失败');
  } finally {
    supplementInputBusy.value = false;
  }
}

async function uploadTechDesignSupplementFiles(files: File[]) {
  if (!files.length) {
    return;
  }
  if (!(await ensureDeliveryReady('上传技术方案补充材料', { allowDirty: true, skipRepositoryChecks: true }))) {
    return;
  }
  supplementInputBusy.value = true;
  try {
    await store.uploadTechDesignFiles(files);
    await loadOpenSpecVisualContextCandidates();
    ElMessage.success('技术方案补充材料已上传');
  } catch (error: any) {
    ElMessage.error(error.message || '技术方案补充材料上传失败');
  } finally {
    supplementInputBusy.value = false;
  }
}

function sourceFileKey(file: Pick<PrdSourceFile, 'id' | 'path'>): string {
  return file.path || file.id;
}

function mergeOpenSpecSupplementFiles(files: PrdSourceFile[]) {
  if (!files.length) {
    return;
  }
  const existingKeys = new Set(openSpecSupplementFiles.value.map(sourceFileKey));
  openSpecSupplementFiles.value = [
    ...openSpecSupplementFiles.value,
    ...files.filter((file) => {
      const key = sourceFileKey(file);
      return key && !existingKeys.has(key);
    })
  ];
}

async function uploadOpenSpecSupplementFiles(files: File[]) {
  if (!files.length || !workflow.value) {
    return;
  }
  if (!(await ensureDeliveryReady('上传 OpenSpec 工件补充材料', { allowDirty: true, skipRepositoryChecks: true }))) {
    return;
  }
  supplementInputBusy.value = true;
  try {
    const previousKeys = new Set((workflow.value.techDesignSourceFiles || []).map(sourceFileKey));
    const updated = await apiClient.uploadTechDesignFiles(workflow.value.requirementId, files);
    store.mergeWorkflowLocally(updated);
    const uploadedFiles = (updated.techDesignSourceFiles || []).filter((file) => {
      const key = sourceFileKey(file);
      return key && !previousKeys.has(key);
    });
    mergeOpenSpecSupplementFiles(uploadedFiles.length ? uploadedFiles : (updated.techDesignSourceFiles || []).slice(-files.length));
    await loadOpenSpecVisualContextCandidates();
    ElMessage.success('OpenSpec 工件补充材料已上传');
  } catch (error: any) {
    ElMessage.error(error.message || 'OpenSpec 工件补充材料上传失败');
  } finally {
    supplementInputBusy.value = false;
  }
}

function formatTokenCount(value?: number) {
  const count = value || 0;
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return String(count);
}

function agentActionParams() {
  return {
    agentId: selectedAgentId.value,
    executionMode: selectedExecutionMode.value
  };
}

function actionButtonText(label: string) {
  return manualCopyMode.value ? `复制${label}命令` : label;
}

function primaryActionIcon(icon: unknown) {
  return manualCopyMode.value ? CopyDocument : icon;
}

function requirementTypeTagType(type?: RequirementType) {
  return type === 'DEFECT' ? 'primary' : 'success';
}

function statusTagType(status?: WorkflowStatus) {
  if (status === 'APPROVED' || status === 'DONE') {
    return 'success';
  }
  if (status === 'REJECTED' || status === 'BLOCKED') {
    return 'danger';
  }
  if (status === 'IN_PROGRESS' || status === 'IN_REVIEW') {
    return 'primary';
  }
  if (status === 'READY_FOR_REVIEW') {
    return 'warning';
  }
  return 'info';
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

async function ensureDeliveryReady(actionLabel: string, options: { allowDirty?: boolean; skipRepositoryChecks?: boolean } = {}) {
  let runtime = getApiRuntimeConfig();
  if (!runtime.projectId) {
    ElMessage.warning('请先选择项目');
    return false;
  }
  if (!runtime.clientSessionId) {
    try {
      await settings.requireClientSessionId();
      runtime = getApiRuntimeConfig();
    } catch (error: any) {
      ElMessage.warning(error.message || '请先在个人中心配置客户端会话ID');
      return false;
    }
  }
  try {
    const workspace = await apiClient.getDeliveryWorkspace(runtime.projectId);
    if (!workspace?.localPath) {
      ElMessage.warning(`请先在个人中心配置当前项目交付工作区，再${actionLabel}`);
      return false;
    }
    if (!options.skipRepositoryChecks) {
      const credentials = await apiClient.listGitCredentials();
      if (!credentials.some((credential) => credential.status === 'ACTIVE')) {
        ElMessage.warning(`请先在个人中心生成Git SSH凭证，再${actionLabel}`);
        return false;
      }
    }
    if (!options.skipRepositoryChecks && runtime.projectId) {
      const repoState = await apiClient.refreshProjectRepositoryStatus(runtime.projectId);
      if (repoState.syncStatus === 'NOT_CLONED') {
        ElMessage.warning('项目产物仓尚未 clone，请先在个人中心完成项目仓初始化');
        return false;
      }
      if (repoState.syncStatus === 'BEHIND_REMOTE') {
        ElMessage.warning('本地项目产物仓落后远端，请先拉取最新提交');
        return false;
      }
      if (repoState.syncStatus === 'CONFLICTING' || repoState.syncStatus === 'FAILED' || repoState.syncStatus === 'PUSHING') {
        ElMessage.warning('项目产物仓状态异常，请先在个人中心处理后再继续');
        return false;
      }
      if (repoState.syncStatus === 'DIRTY' && options.allowDirty === false) {
        ElMessage.warning('项目产物仓存在未同步变更，请先公开同步或清理后再继续流程动作');
        return false;
      }
    }
    if (workflow.value?.id) {
      await apiClient.assertRequirementWritable(workflow.value.id, runtime.clientSessionId);
      await loadWorkspaceStates();
    }
    return true;
  } catch (error: any) {
    if (Array.isArray(error.data)) {
      workspaceStates.value = error.data;
    }
    ElMessage.error(error.message || `无法确认交付工作区状态，已阻断${actionLabel}`);
    return false;
  }
}

async function runOrCopyAction(action: ActionInput, afterRun?: (run?: RunRecord) => Promise<void>) {
  if (!workflow.value) {
    return;
  }
  if (!(await ensureDeliveryReady('执行流程动作'))) {
    return;
  }
  actionRunning.value = true;
  try {
    if (manualCopyMode.value) {
      const { commandText } = await apiClient.previewActionCommand(workflow.value.requirementId, action);
      await copyToClipboard(commandText);
      ElMessage.success('命令已复制');
      return;
    }
    const result = await store.runAction(action);
    const run = result?.run;
    if (run?.id) {
      if (isTerminalOpenedRun(run)) {
        ElMessage.success(terminalOpenedMessage(run));
      } else {
        await openRunLog(run.id);
      }
    }
    await loadRequirementTokenUsage();
    await afterRun?.(run);
  } catch (error: any) {
    ElMessage.error(error.message || '流程动作执行失败');
  } finally {
    actionRunning.value = false;
  }
}

function isTerminalOpenedRun(run: RunRecord): boolean {
  return run.status === 'TERMINAL_OPENED';
}

function terminalOpenedMessage(run: RunRecord): string {
  return run.executionMode === 'INTERACTIVE_TERMINAL'
    ? '已打开本地交互终端，后续交互请在终端中完成'
    : '已打开本地终端，后续执行请在终端中查看';
}

async function runDesign() {
  const documentPath = prdDesignSourcePath.value.trim();
  if (requiresPrdApproval.value && !prdApproved.value) {
    ElMessage.warning('请先通过 PRD 审核');
    return;
  }
  if (requiresPrdApproval.value && !documentPath) {
    ElMessage.warning('未找到 PRD 文档，请先刷新产物');
    return;
  }
  const params: Record<string, unknown> = {
    ...agentActionParams(),
    sourceFiles: techDesignGenerationSourcePaths.value,
    clarification: techDesignSupplementValue.value.markdown.trim(),
    supplementBlocks: techDesignSupplementValue.value.blocks
  };
  if (requiresPrdApproval.value) {
    params.documentPath = documentPath;
  }
  const action: ActionInput = {
    actionType: 'DESIGN_GENERATE',
    params
  };
  if (manualCopyMode.value) {
    await runOrCopyAction(action);
    return;
  }
  pendingDesignAction.value = action;
  memoryRecallDialogVisible.value = true;
}

async function handleMemoryRecallConfirm(memoryRecall: MemoryRecallActionInput) {
  const action = pendingDesignAction.value;
  pendingDesignAction.value = undefined;
  if (!action) {
    return;
  }
  await runOrCopyAction({
    ...action,
    memoryRecall,
    params: {
      ...(action.params || {}),
      memoryRecall
    }
  }, consumeTechDesignSupplementOnSuccess);
}

async function consumeTechDesignSupplementOnSuccess(run?: RunRecord) {
  if (run && !['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
    return;
  }
  designClarification.value = '';
  techDesignSupplementBlocks.value = [];
  await reload();
}

async function runDesignQuestion(rawQuestion: string) {
  if (!workflow.value) {
    return;
  }
  const question = rawQuestion.trim();
  if (!question) {
    ElMessage.warning('请输入技术方案问题');
    return;
  }
  const designDocumentPath = openSpecTechnicalDesignDocumentPath.value.trim();
  if (!designDocumentPath) {
    ElMessage.warning('请先生成、保存或刷新技术方案产物');
    return;
  }
  const params: Record<string, unknown> = {
    ...agentActionParams(),
    question,
    designDocumentPath
  };
  if (requiresPrdApproval.value) {
    const prdDocumentPath = openSpecPrdDocumentPath.value.trim();
    if (!prdDocumentPath) {
      ElMessage.warning('请先生成、保存或刷新 PRD 产物');
      return;
    }
    params.prdDocumentPath = prdDocumentPath;
  }
  await runOrCopyAction({
    actionType: 'DESIGN_QUESTION',
    params
  }, async () => {
    await reload();
    await loadTechDesignQuestionRecords();
    designQuestionDialog.value?.clearQuestion();
  });
}

async function deleteDesignQuestion(item: TechDesignQuestionListItem) {
  if (!workflow.value) {
    return;
  }
  if (!(await ensureDeliveryReady('删除技术方案答疑', { allowDirty: true, skipRepositoryChecks: true  }))) {
    return;
  }
  try {
    await ElMessageBox.confirm(`确认删除问题“${item.summary || item.question}”？`, '删除技术方案答疑', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    });
  } catch {
    return;
  }
  await store.deleteTechDesignQuestion({
    id: item.id,
    recordId: item.recordId,
    runId: item.runId,
    sourcePath: item.sourcePath,
    question: item.question
  });
  await reload();
  await loadTechDesignQuestionRecords();
  ElMessage.success('技术方案答疑问题已删除');
}

async function runOpenSpecStatus() {
  await runOrCopyAction({ actionType: 'OPENSPEC_STATUS', params: { changeName: changeName.value } }, loadOpenSpecSummary);
}

async function runOpenSpecNewChange() {
  if (!techDesignApproved.value) {
    ElMessage.warning('请先通过技术方案审核');
    return;
  }
  if (openSpecChangeExists.value) {
    ElMessage.warning('已检测到对应 OpenSpec 变更目录，无需重复开始变更');
    return;
  }
  await runOrCopyAction({ actionType: 'OPENSPEC_NEW_CHANGE', params: { ...agentActionParams(), changeName: changeName.value } }, loadOpenSpecSummary);
}

async function runOpenSpecArtifacts() {
  if (implementationStepStates.value.START_CHANGE.status !== 'APPROVED') {
    ElMessage.warning('请先完成并审核开始变更步骤');
    return;
  }
  if (!techDesignApproved.value) {
    ElMessage.warning('请先通过技术方案审核');
    return;
  }
  const prdDocumentPath = openSpecPrdDocumentPath.value.trim();
  const documentPath = openSpecTechnicalDesignDocumentPath.value.trim();
  if (!documentPath) {
    ElMessage.warning('请先生成、保存或刷新技术方案产物');
    return;
  }
  if (requiresPrdApproval.value && !prdDocumentPath) {
    ElMessage.warning('请先生成、保存或刷新 PRD 产物');
    return;
  }
  const supplement = openSpecSupplementValue.value;
  const artifactAdjustment = supplement.markdown.trim();
  const visualContextFiles = openSpecVisualContextPaths.value;
  const useVersionContext = openSpecArtifactsComplete.value;
  if (useVersionContext) {
    await loadOpenSpecTechDesignVersions({ selectDefaults: !openSpecTechDesignVersions.value.length });
    if (!selectedOpenSpecTargetVersion.value?.readable) {
      ElMessage.warning('请选择可读取的技术方案目标版本');
      return;
    }
    if (!selectedOpenSpecBaseVersion.value?.readable) {
      ElMessage.warning('请选择可读取的技术方案基线版本');
      return;
    }
    if (openSpecBaseVersionId.value === openSpecTargetVersionId.value && !artifactAdjustment && !supplement.sourceFiles.length && !visualContextFiles.length) {
      ElMessage.warning('基线和目标版本一致，请填写工件调整说明、选择视觉上下文、上传补充材料或选择不同版本');
      return;
    }
  }
  const params: Record<string, unknown> = {
    ...agentActionParams(),
    changeName: changeName.value,
    documentPath,
    sourceFiles: supplement.sourceFiles,
    visualContextFiles,
    artifactAdjustment,
    supplementBlocks: supplement.blocks
  };
  if (useVersionContext) {
    params.baseTechDesignVersionId = openSpecBaseVersionId.value;
    params.targetTechDesignVersionId = openSpecTargetVersionId.value;
  }
  if (requiresPrdApproval.value && prdDocumentPath) {
    params.prdDocumentPath = prdDocumentPath;
  }
  await runOrCopyAction({ actionType: 'OPENSPEC_FF', params }, async (run) => {
    if (run && ['SUCCEEDED', 'COMPLETED'].includes(run.status)) {
      openSpecArtifactAdjustment.value = '';
      openSpecSupplementBlocks.value = [];
      openSpecVisualContextPaths.value = [];
    }
    await loadOpenSpecSummary();
    await loadOpenSpecTechDesignVersions();
  });
}

async function runOpenSpecApply() {
  if (!canRunOpenSpecApply.value) {
    ElMessage.warning('请先通过 OpenSpec 工件评审');
    return;
  }
  await runOrCopyAction({ actionType: 'OPENSPEC_APPLY', params: { ...agentActionParams(), changeName: changeName.value } }, loadOpenSpecSummary);
}

async function runOpenSpecVerify() {
  await runOrCopyAction({ actionType: 'OPENSPEC_VERIFY', params: { ...agentActionParams(), changeName: changeName.value } }, loadOpenSpecSummary);
}

async function loadGitChanges() {
  if (!workflow.value) {
    return;
  }
  try {
    gitChanges.value = await apiClient.getGitChanges(workflow.value.requirementId);
  } catch (error: any) {
    ElMessage.error(error.message || '读取 Git 变更失败');
  }
}

function hasStagedTrackedChanges(summary: GitChangeSummary) {
  return summary.projects.some((project) => project.files.some((file) => file.staged));
}

async function ensureStagedChangesForReview() {
  if (!workflow.value || codeReviewMode.value !== 'staged') {
    return true;
  }
  try {
    const summary = await apiClient.getGitChanges(workflow.value.requirementId);
    gitChanges.value = summary;
    if (hasStagedTrackedChanges(summary)) {
      return true;
    }
    ElMessage.warning('暂存区没有已暂存文件，请先 git add 后再执行暂存区预审');
    return false;
  } catch (error: any) {
    ElMessage.error(error.message || '读取暂存区变更失败');
    return false;
  }
}

async function runCodeReview() {
  if (!(await ensureStagedChangesForReview())) {
    return;
  }
  await runOrCopyAction(
    { 
      actionType: 'CODE_REVIEW', 
      params: { 
        ...agentActionParams(), 
        branchName: branchName.value, 
        reviewMode: codeReviewMode.value,
        docs: openSpecTechnicalDesignDocumentPath.value.trim()
      }});
}

async function runRetrospective() {
  if (!codeReviewApproved.value) {
    ElMessage.warning('请先通过代码评审');
    return;
  }
  await runOrCopyAction({
    actionType: 'RETROSPECTIVE_GENERATE',
    params: {
      ...agentActionParams(),
      branchName: branchName.value,
      clarification: retrospectiveFocus.value.trim()
    }
  }, reloadRetrospectiveArtifacts);
}

async function confirmRetrospectiveCandidate(row: MemoryCandidate) {
  try {
    await apiClient.confirmMemoryCandidate(row.id);
    ElMessage.success('经验已沉淀');
    await loadRetrospective();
  } catch (error: any) {
    ElMessage.error(error.message || '确认失败');
  }
}

async function editRetrospectiveCandidate(row: MemoryCandidate) {
  try {
    const result = await ElMessageBox.prompt('编辑候选经验描述。保存后仍停留在候选池，只有点击“确认”才会沉淀为正式项目经验。', '编辑候选经验', {
      inputValue: row.statement,
      inputType: 'textarea'
    });
    const statement = result.value.trim();
    if (!statement) {
      ElMessage.warning('经验描述不能为空');
      return;
    }
    await apiClient.updateMemoryCandidate(row.id, {
      statement,
      tags: row.tags
    });
    ElMessage.success('候选经验已保存');
    await loadRetrospective();
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') {
      return;
    }
    ElMessage.error(error.message || '保存失败');
  }
}

async function markRetrospectiveCandidateLocal(row: MemoryCandidate) {
  try {
    await apiClient.updateMemoryCandidateStatus(row.id, { status: 'LOCAL_ONLY' });
    ElMessage.success('已标记为仅本需求有效');
    await loadRetrospective();
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  }
}

async function markRetrospectiveCandidatePending(row: MemoryCandidate) {
  try {
    await apiClient.updateMemoryCandidateStatus(row.id, { status: 'PENDING_VERIFY' });
    ElMessage.success('已标记为待验证');
    await loadRetrospective();
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  }
}

async function ignoreRetrospectiveCandidate(row: MemoryCandidate) {
  try {
    await apiClient.ignoreMemoryCandidate(row.id);
    ElMessage.success('已忽略');
    await loadRetrospective();
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  }
}

function recallFeedbackStatusText(status: string) {
  const map: Record<string, string> = {
    EFFECTIVE: '有效',
    PARTIAL: '部分有效',
    UNUSED: '未使用',
    OUTDATED: '已过时',
    MISLEADING: '有误导'
  };
  return map[status] || status;
}

function evidenceSourceText(sourceType: string) {
  const map: Record<string, string> = {
    ANNOTATION: '批注',
    ANNOTATION_REPLY: '批注回复',
    QUESTION: '技术方案答疑',
    CLARIFICATION: '澄清',
    REVIEW: '评审',
    RECALL: '记忆引用',
    RETROSPECTIVE: '复盘',
    MANUAL: '人工记录'
  };
  return map[sourceType] || sourceType;
}

async function runOpenSpecArchive() {
  await runOrCopyAction({ actionType: 'OPENSPEC_ARCHIVE', params: { ...agentActionParams(), changeName: changeName.value } }, loadOpenSpecSummary);
}

async function returnToImplementation() {
  if (!(await ensureDeliveryReady('打回实施', { allowDirty: true }))) {
    return;
  }
  const result = await store.runAction({ actionType: 'RETURN_TO_IMPLEMENTATION' });
  if (result?.run?.id) {
    await openRunLog(result.run.id);
  }
  activeStage.value = 'IMPLEMENTATION';
}

async function toggleOpenSpecTask(task: OpenSpecTaskItem, completed: boolean) {
  if (!workflow.value || openSpecSummary.value?.archived) {
    return;
  }
  try {
    openSpecSummary.value = await apiClient.updateOpenSpecTask(workflow.value.requirementId, {
      changeName: changeName.value || `req-${workflow.value.requirementId}`,
      line: task.line,
      completed,
      raw: task.raw
    });
    openSpecPreviewVersion.value += 1;
    ElMessage.success(completed ? '任务已确认完成' : '任务已取消完成');
  } catch (error: any) {
    ElMessage.error(error.message || '任务状态更新失败');
    await loadOpenSpecSummary();
  }
}

function implementationReviewArtifactPath() {
  if (activeImplementationStep.value === 'ARTIFACT_REVIEW' || activeImplementationStep.value === 'APPLY') {
    return selectedOpenSpecDocPath.value || stageArtifactPath('IMPLEMENTATION');
  }
  if (activeImplementationStep.value === 'CHANGE_INSPECTION') {
    return junitArtifactPath.value || undefined;
  }
  return undefined;
}

function implementationStageReviewArtifactPath() {
  return stageArtifactPath('IMPLEMENTATION') || selectedOpenSpecDocPath.value || junitArtifactPath.value || undefined;
}

async function openStageReview() {
  if (!workflow.value) {
    return;
  }
  if (activeStage.value === 'IMPLEMENTATION' && !canReviewImplementationStage.value) {
    ElMessage.warning('四个实施验证子步骤全部通过后才可审核实施验证');
    return;
  }
  if (activeStage.value === 'RETROSPECTIVE') {
    await loadRetrospective();
    if (!canReviewRetrospectiveStage.value) {
      ElMessage.warning('请先生成复盘报告，并处理完待确认候选经验和未关闭风险');
      return;
    }
  }
  if (!(await ensureDeliveryReady('提交审核', { allowDirty: true }))) {
    return;
  }
  const path =
    activeStage.value === 'PRD'
      ? officialPrdDocumentPath.value
      : activeStage.value === 'IMPLEMENTATION'
        ? implementationStageReviewArtifactPath()
        : stageArtifactPath(activeStage.value);
  reviewDialog.value?.open(
    activeStage.value,
    path,
    undefined,
    workflow.value.requirementId,
    workflow.value.id
  );
}

async function openImplementationStepReview() {
  if (!workflow.value) {
    return;
  }
  if (!(await ensureDeliveryReady('提交审核', { allowDirty: true, skipRepositoryChecks: true  }))) {
    return;
  }
  reviewDialog.value?.open(
    'IMPLEMENTATION',
    implementationReviewArtifactPath(),
    activeImplementationStep.value,
    workflow.value.requirementId,
    workflow.value.id
  );
}

async function openPublicSync() {
  if (!workflow.value) {
    return;
  }
  if (!(await ensureDeliveryReady('公开同步', { allowDirty: true }))) {
    return;
  }
  artifactGitSyncDialog.value?.open(workflow.value.requirementId, workflow.value.id, activeStage.value);
}

async function submitReview(input: {
  stage: WorkflowStage;
  implementationStep?: ImplementationStep;
  decision: 'APPROVED' | 'REJECTED' | 'RISK_ACCEPTED';
  comment: string;
  artifactPath?: string;
}) {
  try {
    await store.submitReview(input);
    ElMessage.success('审核记录已保存');
    await reload({ preferCurrent: true });
    if (input.stage === 'RETROSPECTIVE') {
      await loadRetrospective();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '审核提交失败');
  }
}

async function handleArtifactGitSynced(result: { commitSha?: string; pushed?: boolean }) {
  const successMessage = result.pushed === false
    ? '审核记录已保存'
    : result.commitSha
      ? `产物已推送：${result.commitSha}`
      : '产物已推送';
  ElMessage.success(successMessage);
  await reload();
  if (workflow.value) {
    await store.loadRequirements();
  }
}

async function openRunLog(runId: string) {
  selectedRunTokenUsage.value = emptyRunTokenUsage(runId);
  await store.loadRunEvents(runId);
  selectedRunTokenUsage.value = await loadRunTokenUsage(runId);
  store.streamRunEvents(runId);
  if (typeof runLogDrawer.value?.open === 'function') {
    runLogDrawer.value.open();
  }
}

function openTokenUsageDetails() {
  tokenUsageDetailDialog.value?.open();
}

async function cancelRun(runId: string) {
  await store.cancelRun(runId);
  ElMessage.success('已发送取消请求');
}

watch(
  workflow,
  (value) => {
    if (!value) {
      return;
    }
    const uploadedPaths = new Set((value.prdSourceFiles || []).map((file) => file.path));
    sourceText.value = value.sources.filter((source) => !uploadedPaths.has(source)).join('\n');
    if (
      selectedPrdEditorPath.value &&
      !value.artifacts.some((artifact) => artifact.stage === 'PRD' && artifact.exists && artifact.kind !== 'directory' && artifact.path === selectedPrdEditorPath.value)
    ) {
      selectedPrdEditorPath.value = '';
    }
    if (!prdSupplementDialogVisible.value) {
      prdClarification.value = value.prdClarification || '';
      prdSupplementBlocks.value =
        value.prdSupplementBlocks || buildSupplementBlocks({ text: value.prdClarification, files: value.prdSourceFiles || [] });
    }
    if (!prdClarificationDialogVisible.value) {
      prdClarificationDraftBlocks.value = value.prdClarificationBlocks || [];
    }
    changeName.value = value.stages.IMPLEMENTATION.changeName || `req-${value.requirementId}`;
    branchName.value = value.branchName || '';
    if (!techDesignSupplementDialogVisible.value) {
      designClarification.value = value.techDesignClarification || '';
      techDesignSupplementBlocks.value =
        value.techDesignSupplementBlocks || buildSupplementBlocks({ text: value.techDesignClarification, files: value.techDesignSourceFiles || [] });
    }
    if (!openSpecSupplementDialogVisible.value) {
      openSpecArtifactAdjustment.value = value.openSpecArtifactAdjustment || '';
      openSpecSupplementBlocks.value =
        value.openSpecSupplementBlocks || buildSupplementBlocks({ text: value.openSpecArtifactAdjustment });
      openSpecSupplementFiles.value = [];
    }
    openSpecVisualContextPaths.value = value.openSpecVisualContextPaths || [];
    void loadOpenSpecSummary();
    void loadRequirementTokenUsage();
    const stages = applicableStages.value;
    const nextActiveStage = value.currentStage === 'DONE' ? stages[stages.length - 1] : value.currentStage;
    activeStage.value = stages.includes(nextActiveStage as WorkflowStage) ? (nextActiveStage as WorkflowStage) : stages[0] || 'PRD';

    if (activeStage.value === 'IMPLEMENTATION') {
      activeImplementationStep.value = findFirstPendingImplementationStep(value.implementationSteps);
      if (activeImplementationStep.value === 'ARTIFACT_REVIEW') {
        void loadOpenSpecTechDesignVersions();
        void loadOpenSpecVisualContextCandidates();
      }
    }
    if (activeStage.value === 'RETROSPECTIVE') {
      void loadRetrospective();
    }
    void loadWorkspaceStates();
  },
  { immediate: true }
);

watch(openSpecSupplementDialogVisible, (visible) => {
  if (visible || openSpecSupplementPersisting.value) {
    return;
  }
  openSpecArtifactAdjustment.value = workflow.value?.openSpecArtifactAdjustment || '';
  openSpecSupplementBlocks.value = workflow.value?.openSpecSupplementBlocks || buildSupplementBlocks({ text: workflow.value?.openSpecArtifactAdjustment });
  openSpecSupplementFiles.value = [];
});

watch(activeStage, (stage) => {
  if (stage === 'RETROSPECTIVE') {
    void loadRetrospective();
  }
  if (stage === 'IMPLEMENTATION' && activeImplementationStep.value === 'ARTIFACT_REVIEW') {
    void loadOpenSpecTechDesignVersions();
    void loadOpenSpecVisualContextCandidates();
  }
});

watch(activeImplementationStep, (step) => {
  if (step === 'ARTIFACT_REVIEW') {
    void loadOpenSpecTechDesignVersions();
    void loadOpenSpecVisualContextCandidates();
  }
  if (step === 'CHANGE_INSPECTION') {
    void loadGitChanges();
  }
});

watch(openSpecTargetVersionId, () => {
  if (!openSpecBaseVersionManual.value) {
    applyAutoOpenSpecBaseVersion();
  }
});

watch(
  () => currentStageRun.value?.id || '',
  async (runId) => {
    if (!runId) {
      currentRunTokenUsage.value = undefined;
      return;
    }
    currentRunTokenUsage.value = await loadRunTokenUsage(runId);
  },
  { immediate: true }
);

watch(
  () => techDesignQuestionReadPaths.value.join('|'),
  () => {
    void loadTechDesignQuestionRecords();
  },
  { immediate: true }
);

onMounted(async () => {
  await store.loadAgents();
  await reload({ preferCurrent: true });
});

onUnmounted(() => {
  store.stopRunStream();
  store.stopWorkflowStream();
});
</script>

<style scoped>
.detail-page {
  display: grid;
  gap: 16px;
}

.detail-page > *,
.stage-grid > * {
  min-width: 0;
}

.requirement-hero {
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
}

.requirement-hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 16px 8px;
}

.workspace-state-alert {
  margin: 10px 16px 0;
}

.requirement-breadcrumb {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #64748b;
  font-size: 13px;
}

.requirement-breadcrumb strong {
  color: #334155;
  font-weight: 600;
}

.requirement-hero-actions {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 10px;
}

.requirement-execution-controls {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.execution-select {
  flex: 0 0 auto;
}

.agent-select {
  width: 180px;
}

.mode-select {
  width: 140px;
}

.requirement-title {
  margin: 0;
  padding: 0 16px;
  color: #111827;
  font-size: 20px;
  font-weight: 650;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.requirement-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 16px 14px;
}

.token-summary-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 14px;
}

.token-summary-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid #dbe3ef;
  border-radius: 6px;
  background: #f8fafc;
  color: #475569;
  font-size: 12px;
}

.token-summary-item small {
  color: #64748b;
}

.token-summary-item strong {
  color: #172033;
  font-weight: 650;
}

.token-summary-note {
  color: #64748b;
  font-size: 12px;
}

.token-detail-trigger {
  height: auto;
  padding: 0;
}

.stage-token-button {
  padding: 0 4px;
  color: #475569;
}

.branch-pill {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  height: 24px;
  padding: 0 10px;
  border: 1px solid #dbe3ef;
  border-radius: 6px;
  color: #475569;
  background: #f8fafc;
  font-size: 12px;
  line-height: 22px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stage-grid {
  margin-top: 0;
}

.stage-panel {
  overflow: hidden;
}

.stage-panel-header {
  background: #fff;
}

.stage-content {
  padding: 16px;
}

.stage-actions {
  display: grid;
  gap: 14px;
}

.stage-artifact-section {
  display: grid;
  gap: 12px;
  margin-top: 4px;
  padding: 14px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #f8fbff;
}

.stage-artifact-heading {
  align-items: flex-start;
}

.stage-artifact-heading > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.stage-artifact-heading p {
  margin: 0;
  overflow-wrap: anywhere;
}

.detail-page .toolbar > div {
  min-width: 0;
}

.detail-page .toolbar strong,
.detail-page .toolbar .muted {
  overflow-wrap: anywhere;
}

.action-line {
  display: flex;
  align-items: center;
  gap: 10px;
}

.action-line .el-input {
  max-width: 360px;
}

.openspec-artifact-input-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: linear-gradient(180deg, #fbfdff 0%, #f8fbff 100%);
}

.openspec-version-context-panel {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #fff;
}

.openspec-version-heading {
  align-items: flex-start;
}

.openspec-version-heading > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.openspec-version-heading p {
  margin: 0;
}

.openspec-version-grid {
  --openspec-version-control-height: 40px;
  --openspec-version-label-height: 20px;

  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) minmax(120px, 160px);
  gap: 12px;
  align-items: end;
}

.openspec-version-field {
  display: grid;
  grid-template-rows: var(--openspec-version-label-height) var(--openspec-version-control-height);
  gap: 6px;
  min-width: 0;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
}

.openspec-version-field > span {
  display: flex;
  align-items: center;
  min-height: var(--openspec-version-label-height);
}

.openspec-auto-base-version,
.openspec-manual-base-version {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--openspec-version-control-height);
  min-width: 0;
  min-height: var(--openspec-version-control-height);
}

.openspec-auto-base-version {
  justify-content: space-between;
  padding: 0 10px;
  border: 1px solid #dbe3ef;
  border-radius: 6px;
  background: #fff;
}

.openspec-manual-base-version :deep(.tech-design-version-selector) {
  flex: 1 1 auto;
  min-width: 0;
}

.openspec-restore-base-button {
  height: var(--openspec-version-control-height);
  min-height: var(--openspec-version-control-height);
}

.openspec-auto-base-version > div {
  display: grid;
  gap: 2px;
  min-width: 0;
  align-content: center;
}

.openspec-auto-base-version strong {
  overflow: hidden;
  color: #172033;
  font-size: 13px;
  font-weight: 600;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.openspec-auto-base-version small {
  color: #64748b;
  font-size: 12px;
  font-weight: 400;
  line-height: 14px;
}

.openspec-version-actions {
  display: flex;
  justify-content: flex-end;
}

.openspec-version-field :deep(.tech-design-version-selector) {
  align-items: stretch;
  height: var(--openspec-version-control-height);
  min-height: var(--openspec-version-control-height);
  width: 100%;
}

.openspec-version-field :deep(.el-select) {
  height: var(--openspec-version-control-height);
  width: 100%;
}

.openspec-version-field :deep(.el-input) {
  height: var(--openspec-version-control-height);
}

.openspec-version-field :deep(.el-input__wrapper) {
  height: var(--openspec-version-control-height);
  min-height: var(--openspec-version-control-height);
}

.openspec-version-field :deep(.el-select__wrapper) {
  height: var(--openspec-version-control-height);
  min-height: var(--openspec-version-control-height);
  box-sizing: border-box;
}

.openspec-version-field :deep(.el-select__selection) {
  min-height: calc(var(--openspec-version-control-height) - 2px);
  align-items: center;
}

.openspec-version-field :deep(.version-select) {
  height: var(--openspec-version-control-height);
  width: 100%;
}

.openspec-version-compare-field {
  justify-content: stretch;
}

.openspec-version-compare-button {
  height: var(--openspec-version-control-height);
  width: 100%;
  min-height: var(--openspec-version-control-height);
}

.openspec-command-line {
  padding: 12px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #fff;
}

.design-input-panel {
  display: grid;
  gap: 14px;
  padding: 14px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: linear-gradient(180deg, #fbfdff 0%, #f8fbff 100%);
}

.design-input-block {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.design-context-grid {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.design-context-card {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  border: 1px solid #dbe5f2;
  border-radius: 8px;
  background: #fff;
}

.design-context-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
}

.design-context-card-header > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.design-context-card-header strong {
  color: #172033;
  font-size: 14px;
  line-height: 22px;
}

.design-context-card-header p {
  margin: 0;
  line-height: 20px;
}

.design-supplement-card :deep(.supplement-summary) {
  padding: 0;
  border: 0;
  background: transparent;
}

.design-supplement-card :deep(.supplement-summary.has-content) {
  background: transparent;
}

.design-input-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}

.design-input-heading > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.design-input-heading strong {
  color: #172033;
  font-size: 14px;
  line-height: 22px;
}

.design-input-heading p {
  margin: 0;
  line-height: 20px;
}

.design-upload-button {
  flex: 0 0 auto;
}

.design-file-list {
  background: #fff;
}

.design-question-context {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #eff6ff;
  color: #334155;
  font-size: 13px;
}

.design-question-context span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.design-question-context small {
  color: #2563eb;
  white-space: nowrap;
}

.design-question-empty {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px dashed #d8e0ec;
  border-radius: 8px;
  background: #fbfdff;
  color: #64748b;
  font-size: 13px;
}

.design-question-empty span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 12px;
}

.context-badge.is-muted {
  background: #eef2f7;
  color: #64748b;
}

.design-supplement-note {
  margin: -2px 0 0;
  line-height: 20px;
}

.design-clarification :deep(.el-textarea__inner) {
  min-height: 96px !important;
  border-radius: 8px;
  line-height: 1.6;
}

.design-run-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 2px;
}

.design-run-footer .muted {
  line-height: 20px;
}

.design-run-actions {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 10px;
}

.design-question-entry-button {
  min-width: 116px;
}

.design-run-button {
  min-width: 132px;
}

.implementation-step-nav {
  display: grid;
  grid-template-columns: repeat(4, minmax(130px, 1fr));
  gap: 10px;
}

.implementation-step-button {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 68px;
  padding: 12px;
  border: 1px solid #dbe3ef;
  border-radius: 8px;
  background: #fff;
  color: #1f2a3d;
  text-align: left;
  cursor: pointer;
}

.implementation-step-button.active {
  border-color: #2563eb;
  background: #f8fbff;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
}

.implementation-step-button.approved .step-index {
  background: #16a36a;
}

.implementation-summary-strip {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) auto;
  gap: 18px;
  padding: 14px 16px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}

.summary-main {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.summary-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.summary-path {
  margin: 0;
  min-width: 0;
  color: #64748b;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(72px, 1fr));
  gap: 10px;
  min-width: 360px;
}

.metric-card {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border-left: 1px solid #e3e8f2;
}

.metric-card small {
  color: #64748b;
  font-size: 12px;
}

.metric-card strong {
  color: #172033;
  font-size: 20px;
  line-height: 1.15;
}

.metric-card.done strong {
  color: #16a36a;
}

.metric-card.pending strong {
  color: #f59e0b;
}

.metric-card.issue strong {
  color: #ef4444;
}

.step-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #52637a;
  color: #fff;
  font-size: 13px;
  flex: 0 0 auto;
}

.step-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.step-main strong,
.step-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-main small {
  color: #697891;
}

.design-source-summary {
  max-width: 100%;
}

.design-source-path {
  overflow-wrap: anywhere;
}

.openspec-section {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.section-title .muted {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.openspec-task-list {
  display: grid;
  gap: 12px;
  max-height: 360px;
  overflow: auto;
}

.openspec-task-group {
  display: grid;
  gap: 6px;
}

.openspec-task-row {
  display: grid;
  grid-template-columns: 28px 56px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #eef2f7;
  border-radius: 6px;
}

.openspec-task-row span:last-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.openspec-task-row.done {
  background: #f6fbf8;
  color: #52637a;
}

.openspec-task-id {
  color: #697891;
  font-variant-numeric: tabular-nums;
}

.report-entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #eef2f7;
  border-radius: 6px;
  background: #f8fafc;
}

.report-path {
  min-width: 0;
  color: #52637a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.retrospective-workbench {
  min-width: 0;
}

.retrospective-workbench .action-line .el-input {
  max-width: 520px;
}

.retrospective-summary-strip {
  background: linear-gradient(180deg, #ffffff 0%, #fbf8ff 100%);
}

.retrospective-metrics {
  grid-template-columns: repeat(4, minmax(78px, 1fr));
}

.retrospective-tabs {
  min-width: 0;
}

.retrospective-artifact-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.candidate-review-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0 0 12px;
}

.candidate-empty {
  display: grid;
  gap: 6px;
  max-width: 460px;
  color: #718096;
  line-height: 1.6;
}

.candidate-empty strong {
  color: #334155;
}

.retrospective-timeline {
  display: grid;
  gap: 10px;
}

.retrospective-timeline-item {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
}

.timeline-dot {
  width: 10px;
  height: 10px;
  margin-top: 14px;
  border-radius: 50%;
  background: #a855f7;
  box-shadow: 0 0 0 4px #f3e8ff;
}

.timeline-card {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #eadcf8;
  border-radius: 8px;
  background: #fff;
}

.timeline-card-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.timeline-card p {
  margin: 0;
  color: #334155;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.stage-toolbar-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.hidden-file-input {
  display: none;
}

.prd-file-panel {
  display: grid;
  gap: 10px;
}

.prd-file-list {
  display: grid;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
}

.prd-file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border-bottom: 1px solid #e3e8f2;
}

.prd-file-item:last-child {
  border-bottom: 0;
}

.prd-file-meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.prd-file-meta strong,
.prd-file-meta small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prd-artifact-list {
  display: grid;
  gap: 8px;
}

.prd-artifact-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #fff;
}

.prd-artifact-row.active {
  border-color: #2563eb;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
}

.prd-artifact-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: #eff6ff;
  color: #2563eb;
}

.prd-artifact-icon svg {
  width: 15px;
  height: 15px;
}

.prd-artifact-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.prd-artifact-main strong,
.prd-artifact-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prd-artifact-main strong {
  color: #172033;
  font-size: 14px;
  font-weight: 600;
}

.prd-artifact-main small {
  color: #697891;
}

.prd-artifact-main .version-line {
  color: #2563eb;
}

.prd-artifact-status {
  justify-self: end;
}

.prd-artifact-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.artifact-edit-card {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #fff;
}

.artifact-edit-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.artifact-edit-main strong,
.artifact-edit-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-edit-main strong {
  color: #172033;
  font-size: 14px;
  font-weight: 600;
}

.artifact-edit-main small {
  color: #697891;
}

.artifact-edit-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.prd-clarification-panel {
  display: grid;
  gap: 14px;
}

.prd-clarification-document {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 12px;
  border: 1px solid #e3e8f2;
  border-radius: 8px;
  background: #f8fbff;
}

.prd-clarification-document span {
  color: #64748b;
  overflow-wrap: anywhere;
}

@media (max-width: 760px) {
  .requirement-hero-top {
    align-items: stretch;
    flex-direction: column;
  }

  .requirement-hero-actions {
    justify-content: flex-start;
  }

  .requirement-execution-controls {
    width: 100%;
  }

  .execution-select {
    flex: 1 1 140px;
    width: auto;
  }

  .requirement-title {
    font-size: 18px;
  }

  .action-line {
    align-items: stretch;
    flex-direction: column;
  }

  .action-line .el-input {
    max-width: none;
  }

  .openspec-version-grid {
    grid-template-columns: 1fr;
  }

  .openspec-version-field :deep(.tech-design-version-selector) {
    flex-direction: column;
  }

  .openspec-version-field :deep(.version-select) {
    width: 100%;
  }

  .design-input-heading,
  .design-context-card-header,
  .design-run-footer,
  .design-run-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .design-question-context,
  .design-question-empty {
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .design-question-context span:nth-child(2),
  .design-question-empty span:last-child {
    white-space: normal;
  }

  .design-upload-button,
  .design-question-entry-button,
  .design-run-button {
    width: 100%;
  }

  .stage-toolbar-actions {
    align-items: stretch;
    flex-direction: column;
    width: 100%;
  }

  .prd-artifact-row {
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: flex-start;
  }

  .prd-artifact-status,
  .prd-artifact-actions {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .prd-artifact-actions {
    flex-wrap: wrap;
  }

  .artifact-edit-card {
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: flex-start;
  }

  .artifact-edit-actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .implementation-step-nav {
    grid-template-columns: 1fr;
  }

  .implementation-summary-strip {
    grid-template-columns: 1fr;
  }

  .summary-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    min-width: 0;
  }

  .metric-card {
    border-left: 0;
    border-top: 1px solid #e3e8f2;
  }

  .report-entry {
    align-items: stretch;
    flex-direction: column;
  }

  .report-path {
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
</style>
