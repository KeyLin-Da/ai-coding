package com.opp.aidelivery.center.service;

import com.opp.aidelivery.center.model.entity.DomainEventEntity;
import com.opp.aidelivery.center.model.entity.RunEventEntity;
import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Service
@RequiredArgsConstructor
public class RealtimeEventBroker {

    private static final long TIMEOUT_MS = 30 * 60 * 1000L;

    private final List<DomainSubscription> domainSubscriptions = new CopyOnWriteArrayList<>();
    private final List<RunSubscription> runSubscriptions = new CopyOnWriteArrayList<>();

    public SseEmitter subscribeDomain(Long projectId, Long requirementPk) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        DomainSubscription subscription = new DomainSubscription(projectId, requirementPk, emitter);
        domainSubscriptions.add(subscription);
        emitter.onCompletion(() -> domainSubscriptions.remove(subscription));
        emitter.onTimeout(() -> domainSubscriptions.remove(subscription));
        return emitter;
    }

    public SseEmitter subscribeRun(Long runId) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        RunSubscription subscription = new RunSubscription(runId, emitter);
        runSubscriptions.add(subscription);
        emitter.onCompletion(() -> runSubscriptions.remove(subscription));
        emitter.onTimeout(() -> runSubscriptions.remove(subscription));
        return emitter;
    }

    public void broadcast(DomainEventEntity event) {
        for (DomainSubscription subscription : domainSubscriptions) {
            if (subscription.matches(event)) {
                send(subscription.emitter, "domain-event", event);
            }
        }
    }

    public void broadcast(RunEventEntity event) {
        for (RunSubscription subscription : runSubscriptions) {
            if (subscription.matches(event)) {
                send(subscription.emitter, "run-event", event);
            }
        }
    }

    private void send(SseEmitter emitter, String eventName, Object payload) {
        try {
            emitter.send(SseEmitter.event().name(eventName).data(payload));
        } catch (IOException | IllegalStateException exception) {
            emitter.completeWithError(exception);
        }
    }

    private static class DomainSubscription {

        private final Long projectId;
        private final Long requirementPk;
        private final SseEmitter emitter;

        private DomainSubscription(Long projectId, Long requirementPk, SseEmitter emitter) {
            this.projectId = projectId;
            this.requirementPk = requirementPk;
            this.emitter = emitter;
        }

        private boolean matches(DomainEventEntity event) {
            if (!projectId.equals(event.getProjectId())) {
                return false;
            }
            if (requirementPk == null) {
                return true;
            }
            if ("REQUIREMENT".equals(event.getAggregateType()) && requirementPk.equals(event.getAggregateId())) {
                return true;
            }
            String payload = event.getPayloadJson();
            return payload != null && payload.contains("\"requirementPk\":" + requirementPk);
        }
    }

    private static class RunSubscription {

        private final Long runId;
        private final SseEmitter emitter;

        private RunSubscription(Long runId, SseEmitter emitter) {
            this.runId = runId;
            this.emitter = emitter;
        }

        private boolean matches(RunEventEntity event) {
            return runId.equals(event.getRunId());
        }
    }
}
