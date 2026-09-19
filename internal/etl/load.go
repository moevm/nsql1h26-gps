package etl

import (
	"context"
	"errors"
	"fmt"
	"nosql/internal/domain"
	"time"

	"github.com/neo4j/neo4j-go-driver/v6/neo4j"
)

const (
	BATCH_SIZE    = 1000
	LOAD_INTERVAL = time.Millisecond * 300
	BATCH_LOAD    = `
	UNWIND $batch AS item

		MERGE (c:Cell { index: item.cellIndex })
		ON CREATE SET
			c.resolution = 9

		MERGE (p:POI { id: item.id })
		ON CREATE SET
			p.name = item.name,
			p.type = item.type,
			p.description = item.description,
			p.tags = item.tags,
			p.location = point({ latitude: item.lat, longitude: item.lon }),
			p.createdAt = datetime()
		ON MATCH SET
			p.name = item.name,
			p.type = item.type,
			p.description = item.description,
			p.tags = item.tags,
			p.location = point({ latitude: item.lat, longitude: item.lon }),
			p.updatedAt = datetime()

		MERGE (c)-[:CONTAINS]->(p)
	`
)

func loadBatch(ctx context.Context, session neo4j.Session, pois []*domain.POI) error {
	if len(pois) == 0 {
		return nil
	}

	batch := make([]map[string]any, len(pois))

	for i, poi := range pois {
		batch[i] = map[string]any{
			"id":          poi.ID,
			"name":        poi.Name,
			"type":        poi.Type,
			"description": poi.Description,
			"tags":        poi.Tags,
			"lat":         poi.Location.Lat,
			"lon":         poi.Location.Lon,
			"cellIndex":   poi.Cell.String(),
		}
	}

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (any, error) {
		result, err := tx.Run(ctx, BATCH_LOAD, map[string]any{
			"batch": batch,
		})

		if err != nil {
			return nil, err
		}

		return result.Consume(ctx)
	})

	return err
}

func loadPOIS(ctx context.Context, driver neo4j.Driver, chanPois <-chan *domain.POI) error {
	session := driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	pois := make([]*domain.POI, 0, BATCH_SIZE)

	ticker := time.NewTicker(LOAD_INTERVAL)
	defer ticker.Stop()

	// При ошибке загрузки одного батча не останавливаем конвейер,
	// чтобы не оставить scan заблокированным на отправке в канал,
	// а запоминаем ошибку и возвращаем её в конце.
	var lastErr error

	flush := func() {
		if err := loadBatch(ctx, session, pois); err != nil {
			fmt.Printf("Error loading batch: %v\n", err)
			lastErr = err
		}
		pois = pois[:0]
	}

	for {
		select {
		case <-ctx.Done():
			return errors.Join(lastErr, ctx.Err())
		case <-ticker.C:
			flush()
		case poi, ok := <-chanPois:
			if !ok {
				if err := loadBatch(ctx, session, pois); err != nil {
					return errors.Join(lastErr, err)
				}
				return lastErr
			}

			pois = append(pois, poi)

			if len(pois) >= BATCH_SIZE {
				flush()
				ticker.Reset(LOAD_INTERVAL)
			}
		}
	}
}
